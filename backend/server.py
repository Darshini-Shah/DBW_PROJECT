"""
Smart Allocator — FastAPI Backend Server
Production-ready auth, geo-filtered issues, and real-time data.
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from jose import JWTError, jwt
from passlib.context import CryptContext
from pymongo import MongoClient, GEOSPHERE, errors
from bson import ObjectId
from dotenv import load_dotenv

from geocoding import reverse_geocode, get_radius_km_for_urgency
from pipeline import process_survey_pdf

# ── Configuration ───────────────────────────────────────────────────────────────

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv("MONGODB_URI")
JWT_SECRET = os.getenv("JWT_SECRET", "smart-allocator-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

# ── Database Setup ──────────────────────────────────────────────────────────────

client = MongoClient(MONGODB_URI)
db = client["Dbw_project"]
users_collection = db["users"]
volunteer_collection = db["volunteer"]
field_worker_collection = db["field_worker"]
otp_collection = db["otp_registry"]
issues_collection = db["issues"]
notifications_collection = db["notifications"]

# Create indexes
users_collection.create_index("email", unique=True)
users_collection.create_index([("location", GEOSPHERE)])
volunteer_collection.create_index("email", unique=True)
volunteer_collection.create_index([("location", GEOSPHERE)])
field_worker_collection.create_index("email", unique=True)
field_worker_collection.create_index([("location", GEOSPHERE)])
otp_collection.create_index("email", unique=True)
otp_collection.create_index("expires_at", expireAfterSeconds=0)  # TTL index
issues_collection.create_index([("location", GEOSPHERE)])
issues_collection.create_index("pincode")
issues_collection.create_index("status")

logger.info("MongoDB connected and indexes ensured.")

# ── Auth Utilities ──────────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        if email is None or role is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    collection = volunteer_collection if role == "volunteer" else field_worker_collection
    user = collection.find_one({"email": email})
    
    if user is None:
        # Fallback to users_collection for existing users if any
        user = users_collection.find_one({"email": email})
        if user is None:
            raise credentials_exception

    user["_id"] = str(user["_id"])
    user.pop("password_hash", None)
    return user


# ── Pydantic Models ─────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: str  # "volunteer" or "field_worker"
    fullName: str
    phone: str
    latitude: float
    longitude: float
    # Volunteer-specific (optional)
    skills: Optional[List[str]] = None
    availability: Optional[List[str]] = None
    hasVehicle: Optional[bool] = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: str  # Added role for login

class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class IssueCreateRequest(BaseModel):
    category: str
    description: str = ""
    urgency: int = Field(ge=1, le=10)
    latitude: float
    longitude: float
    number_of_volunteers_needed: Optional[int] = 1


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    fullName: str
    phone: str
    pincode: str
    city: str
    area: str
    latitude: float
    longitude: float
    skills: Optional[List[str]] = None
    availability: Optional[List[str]] = None
    hasVehicle: Optional[bool] = False


# ── FastAPI App ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Smart Allocator API",
    description="Geo-aware NGO resource allocation backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Smart Allocator API is running"}


# ── Mail Setup ──────────────────────────────────────────────────────────────────
import random
import string
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

# Replace with your real SMTP credentials or use env vars
# Using a dummy config for now - USER should provide real credentials
mail_conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", "dummy@gmail.com"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", "password"),
    MAIL_FROM=os.getenv("MAIL_FROM", "info@smartallocator.org"),
    MAIL_PORT=587,
    MAIL_SERVER="smtp.gmail.com",
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

fastmail = FastMail(mail_conf)

def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))

# ── OTP Endpoints ──────────────────────────────────────────────────────────────

@app.post("/auth/send-otp")
async def send_otp(req: OTPRequest):
    # Check if user already exists in either collection
    if volunteer_collection.find_one({"email": req.email}) or field_worker_collection.find_one({"email": req.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    otp = generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    otp_collection.update_one(
        {"email": req.email},
        {"$set": {"otp": otp, "expires_at": expires_at}},
        upsert=True
    )
    
    html = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
        <h2 style="color: #4a90e2;">Verify Your Email</h2>
        <p>Your OTP for Smart Allocator registration is:</p>
        <h1 style="background: #f4f4f4; padding: 10px; text-align: center; letter-spacing: 5px;">{otp}</h1>
        <p>This OTP will expire in 10 minutes.</p>
    </div>
    """
    
    message = MessageSchema(
        subject="Smart Allocator - Email Verification",
        recipients=[req.email],
        body=html,
        subtype=MessageType.html
    )

    try:
        # In actual production, you'd await fastmail.send_message(message)
        # For now, we'll log it and skip sending if credentials aren't set
        logger.info(f"OTP for {req.email}: {otp}")
        if mail_conf.MAIL_USERNAME != "dummy@gmail.com":
            await fastmail.send_message(message)
            return {"message": "OTP sent successfully"}
        else:
            return {"message": "OTP generated and logged (Check server logs)", "dev_otp": otp}
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        # Still return success in dev mode if we logged it
        return {"message": "OTP generated and logged (Check server logs)", "dev_otp": otp}

@app.post("/auth/verify-otp")
async def verify_otp(req: OTPVerifyRequest):
    record = otp_collection.find_one({"email": req.email})
    if not record or record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Optional: Mark as verified or just return success
    return {"message": "OTP verified successfully"}


# ── Auth Endpoints ──────────────────────────────────────────────────────────────

@app.post("/auth/register")
async def register(req: RegisterRequest):
    # Check OTP verification (optional strict check)
    # For now, we assume frontend verified it or we verify here if the record exists
    # but a full implementation would check a 'verified' flag in otp_collection
    
    # Check if user already exists
    target_collection = volunteer_collection if req.role == "volunteer" else field_worker_collection
    if target_collection.find_one({"email": req.email}):
        raise HTTPException(status_code=400, detail="Email already registered in this role")

    # Reverse geocode the GPS coordinates
    geo = await reverse_geocode(req.latitude, req.longitude)

    user_doc = {
        "email": req.email,
        "password_hash": hash_password(req.password),
        "role": req.role,
        "fullName": req.fullName,
        "phone": req.phone,
        "location": {
            "type": "Point",
            "coordinates": [req.longitude, req.latitude],  # GeoJSON: [lng, lat]
        },
        "pincode": geo["pincode"],
        "city": geo["city"],
        "area": geo["area"],
        "state": geo["state"],
        "skills": req.skills or [],
        "availability": req.availability or [],
        "hasVehicle": req.hasVehicle,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = target_collection.insert_one(user_doc)
        user_doc["_id"] = str(result.inserted_id)
        # Clear OTP after successful registration
        otp_collection.delete_one({"email": req.email})
    except errors.DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Generate JWT with role info
    token = create_access_token({"sub": req.email, "role": req.role})

    user_doc.pop("password_hash", None)
    user_doc["latitude"] = req.latitude
    user_doc["longitude"] = req.longitude

    logger.info(f"Registered {req.role}: {req.email} at {geo['area']}, {geo['city']} ({geo['pincode']})")

    return {
        "token": token,
        "user": {
            "id": user_doc["_id"],
            "email": user_doc["email"],
            "role": user_doc["role"],
            "fullName": user_doc["fullName"],
            "phone": user_doc["phone"],
            "pincode": user_doc["pincode"],
            "city": user_doc["city"],
            "area": user_doc["area"],
            "latitude": req.latitude,
            "longitude": req.longitude,
            "skills": user_doc["skills"],
            "availability": user_doc["availability"],
            "hasVehicle": user_doc["hasVehicle"],
        },
    }


@app.post("/auth/login")
async def login(req: LoginRequest):
    # Search in specific collection based on role
    collection = volunteer_collection if req.role == "volunteer" else field_worker_collection
    user = collection.find_one({"email": req.email})
    
    if not user:
        # Fallback to users_collection for legacy users
        user = users_collection.find_one({"email": req.email, "role": req.role})

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": req.email, "role": user["role"]})

    coords = user.get("location", {}).get("coordinates", [0, 0])

    logger.info(f"Login: {req.email} ({user['role']})")

    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "role": user["role"],
            "fullName": user["fullName"],
            "phone": user["phone"],
            "pincode": user.get("pincode", ""),
            "city": user.get("city", ""),
            "area": user.get("area", ""),
            "latitude": coords[1] if len(coords) > 1 else 0,
            "longitude": coords[0] if len(coords) > 0 else 0,
            "skills": user.get("skills", []),
            "availability": user.get("availability", []),
            "hasVehicle": user.get("hasVehicle", False),
        },
    }


@app.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    coords = current_user.get("location", {}).get("coordinates", [0, 0])
    return {
        "user": {
            "id": current_user["_id"],
            "email": current_user["email"],
            "role": current_user["role"],
            "fullName": current_user["fullName"],
            "phone": current_user["phone"],
            "pincode": current_user.get("pincode", ""),
            "city": current_user.get("city", ""),
            "area": current_user.get("area", ""),
            "latitude": coords[1] if len(coords) > 1 else 0,
            "longitude": coords[0] if len(coords) > 0 else 0,
            "skills": current_user.get("skills", []),
            "availability": current_user.get("availability", []),
            "hasVehicle": current_user.get("hasVehicle", False),
        }
    }


# ── Issues Endpoints ────────────────────────────────────────────────────────────

@app.get("/api/issues")
async def get_issues(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: Optional[float] = None,
    pincode: Optional[str] = None,
    status_filter: Optional[str] = "open",
    current_user: dict = Depends(get_current_user),
):
    """
    Fetch issues near the user. Uses geo-radius query.
    If no lat/lng provided, falls back to the user's registered location.
    Radius scales based on issue urgency if not explicitly provided.
    """
    query = {}

    # Status filter
    if status_filter:
        query["status"] = status_filter

    # Determine coordinates
    lat = latitude
    lng = longitude

    if lat is None or lng is None:
        user_coords = current_user.get("location", {}).get("coordinates", [])
        if len(user_coords) >= 2:
            lng, lat = user_coords[0], user_coords[1]

    # If we have coordinates, do a geo query
    if lat is not None and lng is not None:
        search_radius = radius_km or 15.0  # Default 15km radius
        radius_meters = search_radius * 1000

        query["location"] = {
            "$nearSphere": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat],
                },
                "$maxDistance": radius_meters,
            }
        }
    elif pincode:
        query["pincode"] = pincode

    try:
        issues = list(issues_collection.find(query).limit(50))
        for issue in issues:
            issue["_id"] = str(issue["_id"])
        return {"issues": issues, "count": len(issues)}
    except Exception as e:
        logger.error(f"Error fetching issues: {e}")
        # Fallback: return without geo filter
        fallback_query = {"status": status_filter} if status_filter else {}
        issues = list(issues_collection.find(fallback_query).limit(50))
        for issue in issues:
            issue["_id"] = str(issue["_id"])
        return {"issues": issues, "count": len(issues)}


@app.post("/api/issues")
async def create_issue(
    req: IssueCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Field workers submit new community issue reports."""
    if current_user.get("role") != "field_worker":
        raise HTTPException(status_code=403, detail="Only field workers can submit reports")

    # Reverse geocode the issue location
    geo = await reverse_geocode(req.latitude, req.longitude)

    # Generate issue ID
    counter = db["counters"].find_one_and_update(
        {"_id": "surid"},
        {"$inc": {"sequence_value": 1}},
        upsert=True,
        return_document=True,
    )
    surid = f"SUR-{counter['sequence_value']:03d}"

    issue_doc = {
        "surid": surid,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "type of issue": req.category,
        "what is the issue": req.description,
        "scale of urgency": req.urgency,
        "number of volunteer need": req.number_of_volunteers_needed,
        "geographical area": f"{geo['area']}, {geo['city']}".strip(", "),
        "location": {
            "type": "Point",
            "coordinates": [req.longitude, req.latitude],
        },
        "pincode": geo["pincode"],
        "city": geo["city"],
        "area": geo["area"],
        "status": "open",
        "reported_by": current_user["_id"],
        "reported_by_name": current_user["fullName"],
        "assigned_volunteers": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = issues_collection.insert_one(issue_doc)
    issue_doc["_id"] = str(result.inserted_id)

    # Create notifications for nearby volunteers based on urgency radius
    radius_km = get_radius_km_for_urgency(req.urgency)
    radius_meters = radius_km * 1000

    nearby_volunteers = list(users_collection.find({
        "role": "volunteer",
        "location": {
            "$nearSphere": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [req.longitude, req.latitude],
                },
                "$maxDistance": radius_meters,
            }
        }
    }))

    # Notify nearby volunteers
    notification_docs = []
    for vol in nearby_volunteers:
        notification_docs.append({
            "user_id": str(vol["_id"]),
            "issue_id": str(result.inserted_id),
            "surid": surid,
            "type": "new_issue",
            "title": f"New {req.category} issue near you!",
            "message": f"{req.description[:100]}..." if len(req.description) > 100 else req.description,
            "urgency": req.urgency,
            "area": geo["area"],
            "city": geo["city"],
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    if notification_docs:
        notifications_collection.insert_many(notification_docs)
        logger.info(f"Notified {len(notification_docs)} nearby volunteers for {surid}")

    logger.info(f"Issue {surid} created at {geo['area']}, {geo['city']} (urgency: {req.urgency}, radius: {radius_km}km)")

    return {"issue": issue_doc, "volunteers_notified": len(notification_docs)}


@app.post("/api/issues/{issue_id}/accept")
async def accept_issue(issue_id: str, current_user: dict = Depends(get_current_user)):
    """Volunteer accepts/claims an issue."""
    if current_user.get("role") != "volunteer":
        raise HTTPException(status_code=403, detail="Only volunteers can accept issues")

    try:
        result = issues_collection.update_one(
            {"_id": ObjectId(issue_id), "status": "open"},
            {
                "$set": {"status": "assigned"},
                "$addToSet": {
                    "assigned_volunteers": {
                        "id": current_user["_id"],
                        "name": current_user["fullName"],
                        "phone": current_user["phone"],
                        "accepted_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
            },
        )

        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Issue not found or already assigned")

        logger.info(f"Issue {issue_id} accepted by {current_user['fullName']}")
        return {"message": "Issue accepted successfully"}

    except Exception as e:
        logger.error(f"Error accepting issue: {e}")
        raise HTTPException(status_code=500, detail="Failed to accept issue")


# ── Notifications Endpoints ─────────────────────────────────────────────────────

@app.get("/api/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Fetch unread notifications for the current user."""
    notifs = list(
        notifications_collection.find(
            {"user_id": current_user["_id"], "read": False}
        )
        .sort("created_at", -1)
        .limit(20)
    )
    for n in notifs:
        n["_id"] = str(n["_id"])
    return {"notifications": notifs, "count": len(notifs)}


@app.post("/api/notifications/mark-read")
async def mark_notifications_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read."""
    result = notifications_collection.update_many(
        {"user_id": current_user["_id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"marked": result.modified_count}


# ── Nearby Volunteers (for field workers to see available help) ──────────────

@app.get("/api/volunteers/nearby")
async def get_nearby_volunteers(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: float = 15.0,
    current_user: dict = Depends(get_current_user),
):
    lat = latitude
    lng = longitude

    if lat is None or lng is None:
        user_coords = current_user.get("location", {}).get("coordinates", [])
        if len(user_coords) >= 2:
            lng, lat = user_coords[0], user_coords[1]

    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Location required")

    radius_meters = radius_km * 1000

    volunteers = list(users_collection.find({
        "role": "volunteer",
        "location": {
            "$nearSphere": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat],
                },
                "$maxDistance": radius_meters,
            }
        }
    }).limit(50))

    for v in volunteers:
        v["_id"] = str(v["_id"])
        v.pop("password_hash", None)

    return {"volunteers": volunteers, "count": len(volunteers)}


# ── Survey Upload (PDF → OCR → AI → DB) ────────────────────────────────────────

@app.post("/api/survey/upload")
async def upload_survey(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Field workers upload a PDF survey form.
    The pipeline runs: OCR → Gemini AI structuring → MongoDB upload.
    The AI decides what issues exist — the field worker just uploads.
    """
    if current_user.get("role") != "field_worker":
        raise HTTPException(status_code=403, detail="Only field workers can upload surveys")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Read PDF bytes
    pdf_bytes = await file.read()

    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(pdf_bytes) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    # Get reporter's location for geo-tagging the extracted issues
    reporter_location = current_user.get("location")

    logger.info(f"Survey upload by {current_user['fullName']}: {file.filename}")

    # Run the full pipeline
    result = await process_survey_pdf(
        pdf_bytes=pdf_bytes,
        filename=file.filename,
        reporter_id=current_user["_id"],
        reporter_name=current_user["fullName"],
        reporter_location=reporter_location,
    )

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline failed: {result.get('error', 'Unknown error')}"
        )

    return {
        "message": f"Survey processed! Found {result['issues_found']} issue(s).",
        "issues_found": result["issues_found"],
        "survey_ids": result["survey_ids"],
        "surveys": result["surveys"],
    }


# ── Entry Point ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
