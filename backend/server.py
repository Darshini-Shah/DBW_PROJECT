"""
Smart Allocator — FastAPI Backend Server
Production-ready auth, geo-filtered issues, and real-time data.
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from jose import JWTError, jwt
from passlib.context import CryptContext
from pymongo import MongoClient, GEOSPHERE, errors
from bson import ObjectId
from dotenv import load_dotenv

from geocoding import reverse_geocode, get_radius_km_for_urgency, forward_geocode
from pipeline import process_survey_pdf
from model import enrich_issue

# ── Configuration ───────────────────────────────────────────────────────────────

# Load environment variables from the root directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv("MONGODB_URI")
JWT_SECRET = os.getenv("JWT_SECRET", "smart-allocator-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

# ── Database Setup ──────────────────────────────────────────────────────────────

client = MongoClient(MONGODB_URI)
# Use environment variable for DB name, defaulting to 'dbw_project'
# The error "db already exists with different" often occurs due to casing differences (e.g., dbw_project vs DBW_PROJECT)
DB_NAME = os.getenv("DB_NAME", "dbw_project")
db = client[DB_NAME]

users_collection = db["users"]
volunteer_collection = db["volunteer"]
field_worker_collection = db["field_worker"]  # Fixed typo: feild_worker -> field_worker
otp_collection = db["otp_registry"]
issues_collection = db["issues"]
# notifications_collection removed
assignments_collection = db["assignments"]   # volunteer invites & acceptances

# Create indexes
try:
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
    assignments_collection.create_index([("surid", 1), ("volunteer_id", 1)], unique=True, sparse=True)
    assignments_collection.create_index("volunteer_id")
    logger.info(f"MongoDB connected to '{DB_NAME}' and indexes ensured.")
except errors.OperationFailure as e:
    logger.warning(f"Index creation failed (likely already exists with different options): {e}")
except Exception as e:
    logger.error(f"Unexpected database error during index creation: {e}")

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

def serialize_mongo_doc(doc):
    if isinstance(doc, dict):
        return {k: str(v) if isinstance(v, ObjectId) else serialize_mongo_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize_mongo_doc(item) for item in doc]
    return doc

# ── Pydantic Models ─────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: str  # "volunteer" or "field_worker"
    fullName: str
    phone: str
    latitude: float
    longitude: float
    pincode: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    state: Optional[str] = None
    street: Optional[str] = None
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
    pincode: Optional[str] = ""
    city: Optional[str] = ""
    area: Optional[str] = ""
    latitude: Optional[float] = 0.0
    longitude: Optional[float] = 0.0
    skills: Optional[List[str]] = None
    availability: Optional[List[str]] = None
    hasVehicle: Optional[bool] = False
    points: Optional[int] = 0

class UpdateDaysRequest(BaseModel):
    volunteer_id: str
    days: int

class CompleteTaskRequest(BaseModel):
    findings: Optional[str] = ""
    summary: Optional[str] = ""

class ProfileUpdateRequest(BaseModel):
    phone: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    skills: Optional[List[str]] = None
    availability: Optional[List[str]] = None
    hasVehicle: Optional[bool] = None

class IssueCommentRequest(BaseModel):
    comment: str


# ── FastAPI App ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Smart Allocator API",
    description="Geo-aware NGO resource allocation backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"],
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
    VALIDATE_CERTS=False  # Disabled for easier dev setup
)

fastmail = FastMail(mail_conf)

def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))

async def send_urgent_issue_email(issue_doc: dict):
    try:
        urgency = issue_doc.get("scale of urgency", 1)
        if urgency <= 7:
            return
        
        # Get all volunteers
        volunteers = list(volunteer_collection.find({}, {"email": 1}))
        if not volunteers:
            # Fallback to users_collection where role=volunteer
            volunteers = list(users_collection.find({"role": "volunteer"}, {"email": 1}))
            
        emails = [v["email"] for v in volunteers if "email" in v]
        if not emails:
            logger.info("No volunteers found to email for urgent issue.")
            return

        category = issue_doc.get("type of issue", "Issue")
        location = issue_doc.get("geographical area", "Unknown Location")
        if not location and issue_doc.get("city"):
            location = issue_doc.get("city")
            
        subject = f"URGENT: New {category} in {location}"
        dashboard_link = "http://localhost:5173/volunteer"
        
        html = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #d9534f;">Urgent Issue Reported</h2>
            <p>A new <strong>{category}</strong> issue with high urgency (Level {urgency}) has been reported.</p>
            <p><strong>Location:</strong> {location}</p>
            <p><strong>Description:</strong> {issue_doc.get("what is the issue", "No description provided.")}</p>
            <p>Please check your dashboard to accept the task and provide immediate assistance.</p>
            <div style="text-align: center; margin-top: 30px;">
                <a href="{dashboard_link}" style="background-color: #0275d8; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Go to Dashboard</a>
            </div>
        </div>
        """
        
        # FastMail expects recipients to be a list, if many we might hit limits or need to bcc, but for now we'll just send
        message = MessageSchema(
            subject=subject,
            recipients=emails,  # sends to all
            body=html,
            subtype=MessageType.html
        )
        
        if mail_conf.MAIL_USERNAME != "dummy@gmail.com":
            await fastmail.send_message(message)
            logger.info(f"Urgent issue email sent to {len(emails)} volunteers.")
        else:
            logger.info(f"Urgent issue email generated and logged (Check server logs). Recipients: {len(emails)}")
    except Exception as e:
        logger.error(f"Failed to send urgent issue email: {e}")


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
        
        # Check if we have real credentials (not dummy and not empty)
        has_real_creds = (
            mail_conf.MAIL_USERNAME != "dummy@gmail.com" and 
            mail_conf.MAIL_USERNAME and 
            mail_conf.MAIL_PASSWORD and 
            mail_conf.MAIL_PASSWORD != "password"
        )

        if has_real_creds:
            await fastmail.send_message(message)
            return {"message": "OTP sent successfully"}
        else:
            logger.info("Using DEV MODE for OTP (no real mail credentials found)")
            return {
                "message": "OTP generated in DEV MODE (Check server logs)", 
                "dev_otp": otp,
                "info": "To send real emails, set MAIL_USERNAME and MAIL_PASSWORD in .env"
            }
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        # Return the OTP anyway in the response so the user can continue in dev mode
        return {
            "message": "Failed to send email, but OTP is available for dev", 
            "dev_otp": otp, 
            "error": str(e)
        }

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

    # LOCATION LOGIC: Mandatory auto-detect GPS coordinates
    lat, lng = req.latitude, req.longitude
    
    # Use provided address fields or fallback to reverse geocoding
    pincode, city, area, state, street = req.pincode, req.city, req.area, req.state, req.street
    
    if not pincode or not city:
        try:
            geo = await reverse_geocode(lat, lng)
            pincode = pincode or geo.get("pincode", "")
            city = city or geo.get("city", "")
            area = area or geo.get("area", "")
            state = state or geo.get("state", "")
        except Exception as e:
            logger.warning(f"Reverse geocode failed for {req.email}: {e}")
            pincode, city, area, state = pincode or "000000", city or "Unknown", area or "Unknown", state or "Unknown"

    user_doc = {
        "email": req.email,
        "password_hash": hash_password(req.password),
        "role": req.role,
        "fullName": req.fullName,
        "phone": req.phone,
        "location": {
            "type": "Point",
            "coordinates": [lng, lat],  # GeoJSON: [lng, lat]
        },
        "pincode": pincode,
        "city": city,
        "area": area, # District/State for volunteers
        "state": state,
        "street": street,
        "skills": req.skills or [],
        "availability": req.availability or [],
        "hasVehicle": req.hasVehicle,
        "points": 0,
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

    logger.info(f"Registered {req.role}: {req.email} at {area}, {city} ({pincode})")

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
            "latitude": lat,
            "longitude": lng,
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
            "points": current_user.get("points", 0),
        }
    }


@app.put("/auth/me")
async def update_me(req: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    collection = volunteer_collection if current_user["role"] == "volunteer" else field_worker_collection
    
    update_data = {}
    if req.phone is not None: update_data["phone"] = req.phone
    if req.skills is not None: update_data["skills"] = req.skills
    if req.availability is not None: update_data["availability"] = req.availability
    if req.hasVehicle is not None: update_data["hasVehicle"] = req.hasVehicle
    
    # Location updates
    if req.latitude is not None and req.longitude is not None:
        update_data["location"] = {"type": "Point", "coordinates": [req.longitude, req.latitude]}
        update_data["latitude"] = req.latitude
        update_data["longitude"] = req.longitude
        try:
            geo = await reverse_geocode(req.latitude, req.longitude)
            update_data["pincode"] = geo["pincode"]
            update_data["city"] = geo["city"]
            update_data["area"] = geo["area"]
            update_data["state"] = geo["state"]
        except Exception:
            pass # Keep existing or use provided
    
    # Allow manual override
    if req.city is not None: update_data["city"] = req.city
    if req.area is not None: update_data["area"] = req.area
    if req.pincode is not None: update_data["pincode"] = req.pincode

    if not update_data:
        return {"message": "No data to update"}

    collection.update_one({"_id": ObjectId(current_user["_id"])}, {"$set": update_data})
    
    # Fetch updated user to return
    updated_user = collection.find_one({"_id": ObjectId(current_user["_id"])})
    coords = updated_user.get("location", {}).get("coordinates", [0, 0])
    
    return {
        "message": "Profile updated successfully",
        "user": {
            "id": str(updated_user["_id"]),
            "email": updated_user["email"],
            "role": updated_user["role"],
            "fullName": updated_user["fullName"],
            "phone": updated_user["phone"],
            "pincode": updated_user.get("pincode", ""),
            "city": updated_user.get("city", ""),
            "area": updated_user.get("area", ""),
            "latitude": coords[1] if len(coords) > 1 else 0,
            "longitude": coords[0] if len(coords) > 0 else 0,
            "skills": updated_user.get("skills", []),
            "availability": updated_user.get("availability", []),
            "hasVehicle": updated_user.get("hasVehicle", False),
            "points": updated_user.get("points", 0),
        }
    }


@app.get("/auth/me/analytics")
async def get_me_analytics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "volunteer":
        vol_id = current_user["_id"]
        # Convert to string and ObjectId for flexibility
        id_variants = [vol_id]
        try: id_variants.append(ObjectId(vol_id))
        except Exception: pass
        
        # Get all completed assignments
        accepted = list(assignments_collection.find(
            {"volunteer_id": {"$in": id_variants}, "status": "accepted"}
        ))
        issue_ids = []
        for a in accepted:
            try: issue_ids.append(ObjectId(a["issue_id"]))
            except: pass
        
        issues = list(issues_collection.find({"_id": {"$in": issue_ids}, "status": "completed"}))
        
        total_active_days = 0
        past_contributions = []
        
        for issue in issues:
            days = 0
            points_earned = 0
            for vol in issue.get("assigned_volunteers", []):
                if vol["id"] == vol_id:
                    days = vol.get("days_worked", 0)
                    urgency = int(issue.get("scale of urgency", 1))
                    points_earned = days * urgency
                    total_active_days += days
                    break
            
            past_contributions.append({
                "issue_id": str(issue["_id"]),
                "surid": issue.get("surid"),
                "category": issue.get("type of issue") or issue.get("category"),
                "area": issue.get("geographical area"),
                "days_worked": days,
                "points_earned": points_earned,
                "field_findings": issue.get("field_findings"),
                "completed_at": issue.get("end_date")
            })
            
        return {
            "total_points": current_user.get("points", 0),
            "total_active_days": total_active_days,
            "tasks_completed": len(past_contributions),
            "past_contributions": sorted(past_contributions, key=lambda x: x.get("completed_at") or "", reverse=True)
        }
    else:
        # Field Worker
        reports = list(issues_collection.find({"reported_by": current_user["_id"]}).sort("created_at", -1))
        
        stats = {"total": len(reports), "open": 0, "ongoing": 0, "completed": 0}
        report_list = []
        
        for r in reports:
            status = r.get("status", "open")
            if status in stats: stats[status] += 1
            else: stats["open"] += 1
            
            report_list.append({
                "issue_id": str(r["_id"]),
                "surid": r.get("surid"),
                "category": r.get("type of issue") or r.get("category"),
                "status": status,
                "created_at": r.get("created_at"),
                "comments": r.get("comments", []),
                "field_findings": r.get("field_findings")
            })
            
        return {
            "stats": stats,
            "reports": report_list
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

    # If volunteer, exclude issues where they are already assigned
    if current_user.get("role") == "volunteer":
        query["assigned_volunteers.id"] = {"$ne": current_user["_id"]}

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
        issues = list(issues_collection.find(query).limit(100))
        
        # If the requester is a volunteer, filter by matching skills and location (optional but recommended by user)
        if current_user.get("role") == "volunteer":
            filtered_issues = []
            user_skills = [s.lower() for s in current_user.get("skills", [])]
            user_area = current_user.get("area", "").lower()
            user_city = current_user.get("city", "").lower()

            for issue in issues:
                issue_category = issue.get("type of issue", "").lower()
                issue_area = issue.get("geographical area", "").lower()
                
                # Check for skill match
                skill_match = any(user_skill in issue_category or issue_category in user_skill for user_skill in user_skills)
                
                # Check for area match (city or specific area)
                area_match = (user_area and user_area in issue_area) or \
                             (user_city and user_city in issue_area) or \
                             (issue_area and issue_area in user_area)

                # Volunteer sees it if it matches skills OR location (as fallback, or both)
                # Following matcher.py's spirit: Location match is often enough, but Skills prioritize.
                if skill_match or area_match:
                    filtered_issues.append(serialize_mongo_doc(issue))
            
            return {"issues": filtered_issues, "count": len(filtered_issues)}

        serialized_issues = [serialize_mongo_doc(i) for i in issues]
        return {"issues": serialized_issues, "count": len(serialized_issues)}
    except Exception as e:
        logger.error(f"Error fetching issues: {e}")
        # Fallback: return without geo filter
        fallback_query = {"status": status_filter} if status_filter else {}
        issues = list(issues_collection.find(fallback_query).limit(50))
        serialized_issues = [serialize_mongo_doc(i) for i in issues]
        return {"issues": serialized_issues, "count": len(serialized_issues)}


@app.get("/api/heatmap-data")
async def get_heatmap_data():
    """Returns coordinates and importance scores for the heat map."""
    try:
        heatmap_points = []
        
        # 1. Fetch from issues collection
        issues = list(issues_collection.find({}))
        for issue in issues:
            lat, lng = None, None
            
            # Try GeoJSON
            loc = issue.get("location")
            if loc and isinstance(loc, dict) and loc.get("type") == "Point":
                coords = loc.get("coordinates")
                if coords and len(coords) >= 2:
                    lng, lat = coords[0], coords[1]
            
            # Try top-level lat/lng
            if lat is None or lng is None:
                lat = issue.get("lat") or issue.get("latitude")
                lng = issue.get("lng") or issue.get("longitude")
            
            # Try nested coordinates
            if (lat is None or lng is None) and "coordinates" in issue:
                c = issue["coordinates"]
                if isinstance(c, (list, tuple)) and len(c) >= 2:
                    lat, lng = c[0], c[1]

            # Check if we already have coordinates from the logic above
            if lat is not None and lng is not None:
                pass 
            elif issue.get("area") or issue.get("city") or issue.get("pincode"):
                # On-the-fly geocoding fallback for heatmap
                try:
                    area = issue.get("area", "")
                    city = issue.get("city", "")
                    pincode = issue.get("pincode", "")
                    
                    geo = await forward_geocode(city=city, district=area, pincode=pincode)
                    if geo["success"]:
                        lat, lng = geo["latitude"], geo["longitude"]
                        # Store it back in DB to speed up next time
                        issues_collection.update_one({"_id": issue["_id"]}, {"$set": {"location": {"type": "Point", "coordinates": [lng, lat]}}})
                except Exception as e:
                    logger.warning(f"Heatmap: Fallback geocoding failed for {issue.get('_id')}: {e}")

            if lat is not None and lng is not None:
                try:
                    lat, lng = float(lat), float(lng)
                    if lat == 0 and lng == 0: continue
                    
                    urgency = issue.get("scale of urgency") or issue.get("urgency") or 5
                    effect = issue.get("scale of effect") or 5
                    importance = issue.get("importance")
                    
                    if importance is None:
                        importance = (int(urgency) * 5) + (int(effect) * 5)
                    
                    heatmap_points.append({
                        "lat": lat,
                        "lng": lng,
                        "importance": float(importance)
                    })
                except:
                    continue
        
        # 2. Fetch from surveys collection (legacy or uploaded raw data)
        surveys_collection = db["surveys"]
        surveys = list(surveys_collection.find({}))
        for doc in surveys:
            try:
                lat = doc.get('lat')
                lng = doc.get('lng')
                if lat is not None and lng is not None:
                    heatmap_points.append({
                        "lat": float(lat),
                        "lng": float(lng),
                        "importance": float(doc.get('importance', 50))
                    })
            except (ValueError, TypeError):
                continue
        
        logger.info(f"Heatmap data: {len(heatmap_points)} points sent.")
        return heatmap_points
    except Exception as e:
        logger.error(f"Heatmap data error: {e}")
        return []

@app.post("/api/issues")
async def create_issue(
    req: IssueCreateRequest,
    background_tasks: BackgroundTasks,
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

    # Enrich the issue with AI-derived fields (req_skillset, estimated_days, max_points)
    # This is the single Gemini call that adds all missing metadata.
    try:
        issue_doc = await enrich_issue(issue_doc)
        logger.info(
            f"Issue enriched: skills={issue_doc.get('req_skillset')}, "
            f"days={issue_doc.get('estimated_days')}, pts={issue_doc.get('max_points')}"
        )
    except Exception as e:
        logger.warning(f"AI enrichment skipped (non-fatal): {e}")

    result = issues_collection.insert_one(issue_doc)
    issue_doc["_id"] = str(result.inserted_id)

    # Trigger background email if urgency > 7
    if req.urgency > 7:
        background_tasks.add_task(send_urgent_issue_email, issue_doc)

    logger.info(f"Issue {surid} created at {geo['area']}, {geo['city']} (urgency: {req.urgency}, radius: {radius_km}km)")

    return {"issue": issue_doc}


@app.post("/api/issues/{issue_id}/accept")
async def accept_issue(issue_id: str, current_user: dict = Depends(get_current_user)):
    """
    Volunteer accepts an issue they were invited to.
    Rules:
      - Only `num_vol_needed` volunteers can accept (first-come, first-served).
      - Once the cap is reached, remaining invitees see "fully staffed".
      - When cap is met, issue status → "ongoing".
    """
    if current_user.get("role") != "volunteer":
        raise HTTPException(status_code=403, detail="Only volunteers can accept issues")

    try:
        issue = issues_collection.find_one({"_id": ObjectId(issue_id)})
        if not issue:
            raise HTTPException(status_code=404, detail="Issue not found")

        if issue.get("status") not in ("open", "pending"):
            raise HTTPException(status_code=400, detail=f"Issue is already {issue['status']}")

        num_needed = int(
            issue.get("number of volunteer need")
            or issue.get("num_vol_needed")
            or 1
        )

        vol_id = current_user["_id"]

        # Check if there's an invite record for this volunteer (using surid for index consistency)
        invite = assignments_collection.find_one(
            {"surid": issue.get("surid"), "volunteer_id": vol_id}
        )

        if invite and invite.get("status") == "accepted":
            raise HTTPException(status_code=400, detail="You have already accepted this issue")

        # Count how many have already accepted
        accepted_count = assignments_collection.count_documents(
            {"issue_id": issue_id, "status": "accepted"}
        )

        if accepted_count >= num_needed:
            raise HTTPException(
                status_code=400,
                detail=f"This issue is already fully staffed ({num_needed}/{num_needed} volunteers)"
            )

        now = datetime.now(timezone.utc).isoformat()
        
        # 1. Update/Upsert the assignment record
        assignments_collection.update_one(
            {"surid": issue.get("surid"), "volunteer_id": vol_id},
            {
                "$set": {
                    "issue_id": issue_id,
                    "volunteer_name": current_user.get("fullName", ""),
                    "volunteer_email": current_user.get("email", ""),
                    "volunteer_phone": current_user.get("phone", ""),
                    "status": "accepted",
                    "accepted_at": now
                },
                "$setOnInsert": {
                    "invited_at": None
                }
            },
            upsert=True
        )

        # 2. Add to issue's assigned_volunteers using $addToSet (prevents duplicates)
        vol_entry = {
            "id": vol_id,
            "name": current_user.get("fullName", ""),
            "points": current_user.get("points", 0),
            "days_worked": 0
        }
        issues_collection.update_one(
            {"_id": ObjectId(issue_id)},
            {"$addToSet": {"assigned_volunteers": vol_entry}}
        )

        # Calculate new count
        new_accepted_count = assignments_collection.count_documents(
            {"issue_id": issue_id, "status": "accepted"}
        )

        # If we just hit the cap → mark issue as ongoing
        if new_accepted_count >= num_needed:
            issues_collection.update_one(
                {"_id": ObjectId(issue_id)},
                {"$set": {"status": "ongoing"}}
            )
            logger.info(f"Issue {issue_id} is now fully staffed → status: ongoing")

        logger.info(f"Issue {issue_id} accepted successfully by {current_user['fullName']} ({new_accepted_count}/{num_needed})")
        return {
            "message": "Issue accepted successfully",
            "accepted": new_accepted_count,
            "needed": num_needed,
            "fully_staffed": new_accepted_count >= num_needed,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in accept_issue: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Accept failed: {str(e)}")


@app.get("/api/issues/my-tasks")
async def get_my_tasks(current_user: dict = Depends(get_current_user)):
    """Fetch issues the current volunteer has accepted, via the assignments collection."""
    if current_user.get("role") != "volunteer":
        raise HTTPException(status_code=403, detail="Only volunteers have assigned tasks")

    vol_id = current_user["_id"]  # str

    # Build a query that handles volunteer_id stored as string or ObjectId
    id_variants = [vol_id]
    try:
        id_variants.append(ObjectId(vol_id))
    except Exception:
        pass

    accepted = list(
        assignments_collection.find(
            {"volunteer_id": {"$in": id_variants}, "status": "accepted"}
        ).sort("accepted_at", -1)
    )

    if not accepted:
        return {"issues": []}

    # Collect issue ObjectIds preserving order
    issue_oids = []
    for a in accepted:
        try:
            issue_oids.append(ObjectId(a["issue_id"]))
        except Exception:
            pass

    if not issue_oids:
        return {"issues": []}

    issues_raw = list(issues_collection.find({"_id": {"$in": issue_oids}}))

    # Preserve accepted order and attach metadata
    issue_map = {str(i["_id"]): i for i in issues_raw}
    issues = []
    for a in accepted:
        issue = issue_map.get(a["issue_id"])
        if issue:
            issue["_id"] = str(issue["_id"])
            # Determine manager: volunteer with highest points in assigned_volunteers
            assigned_vols = issue.get("assigned_volunteers", [])
            if assigned_vols:
                manager = max(assigned_vols, key=lambda x: x.get("points", 0))
                issue["is_manager"] = (manager["id"] == vol_id)
            else:
                issue["is_manager"] = False
            issues.append(issue)

    return {"issues": issues}


@app.post("/api/issues/{issue_id}/update-days")
async def update_volunteer_days(issue_id: str, req: UpdateDaysRequest, current_user: dict = Depends(get_current_user)):
    """Manager adds days to a volunteer for a specific issue."""
    issue = issues_collection.find_one({"_id": ObjectId(issue_id)})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    assigned_vols = issue.get("assigned_volunteers", [])
    if not assigned_vols:
        raise HTTPException(status_code=400, detail="No volunteers assigned to this issue")

    manager = max(assigned_vols, key=lambda x: x.get("points", 0))
    if manager["id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the manager can update days")

    if issue.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Task is already completed")

    # Update the specific volunteer's days_worked in the array
    result = issues_collection.update_one(
        {"_id": ObjectId(issue_id), "assigned_volunteers.id": req.volunteer_id},
        {"$inc": {"assigned_volunteers.$.days_worked": req.days}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Failed to update days. Volunteer might not be in this issue.")

    return {"message": "Days updated successfully"}


@app.post("/api/issues/{issue_id}/start")
async def start_issue(issue_id: str, current_user: dict = Depends(get_current_user)):
    """Manager marks task as started."""
    issue = issues_collection.find_one({"_id": ObjectId(issue_id)})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    assigned_vols = issue.get("assigned_volunteers", [])
    if not assigned_vols:
        raise HTTPException(status_code=400, detail="No volunteers assigned")

    manager = max(assigned_vols, key=lambda x: x.get("points", 0))
    if manager["id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the manager can start the task")

    if issue.get("start_date"):
        raise HTTPException(status_code=400, detail="Task already started")

    issues_collection.update_one(
        {"_id": ObjectId(issue_id)},
        {"$set": {"start_date": datetime.now(timezone.utc).isoformat(), "status": "in_progress"}}
    )
    return {"message": "Task started successfully"}


@app.post("/api/issues/{issue_id}/complete")
async def complete_issue(issue_id: str, req: CompleteTaskRequest = CompleteTaskRequest(), current_user: dict = Depends(get_current_user)):
    """Manager marks task as done. Points are awarded. Findings are stored."""
    issue = issues_collection.find_one({"_id": ObjectId(issue_id)})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    if issue.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Task is already completed")

    assigned_vols = issue.get("assigned_volunteers", [])
    if not assigned_vols:
        raise HTTPException(status_code=400, detail="No volunteers assigned")

    manager = max(assigned_vols, key=lambda x: x.get("points", 0))
    if manager["id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the manager can complete the task")

    # Build update payload
    update_fields = {
        "status": "completed",
        "end_date": datetime.now(timezone.utc).isoformat()
    }

    # Store field findings if provided
    if req.findings or req.summary:
        update_fields["field_findings"] = {
            "notes": req.findings or "",
            "summary": req.summary or "",
            "recorded_by": current_user.get("fullName", ""),
            "recorded_by_id": current_user["_id"],
            "recorded_at": datetime.now(timezone.utc).isoformat()
        }

    issues_collection.update_one(
        {"_id": ObjectId(issue_id)},
        {"$set": update_fields}
    )

    # Award points to volunteers: days_worked * urgency
    urgency = int(issue.get("scale of urgency", 1))
    points_awarded = []
    for vol in assigned_vols:
        days = vol.get("days_worked", 0)
        points_to_add = days * urgency
        if points_to_add > 0:
            volunteer_collection.update_one(
                {"_id": ObjectId(vol["id"])},
                {"$inc": {"points": points_to_add}}
            )
        points_awarded.append({"id": vol["id"], "name": vol.get("name", ""), "days": days, "points": points_to_add})

    logger.info(f"Task {issue_id} completed by manager {current_user['fullName']}. Points: {points_awarded}")
    return {"message": "Task completed successfully. Points have been distributed.", "points_awarded": points_awarded}



@app.get("/api/issues/{issue_id}/findings")
async def get_issue_findings(issue_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve field findings for a completed issue."""
    issue = issues_collection.find_one({"_id": ObjectId(issue_id)})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    findings = issue.get("field_findings", None)
    return {
        "surid": issue.get("surid"),
        "status": issue.get("status"),
        "field_findings": findings
    }


@app.post("/api/issues/{issue_id}/comments")
async def add_issue_comment(issue_id: str, req: IssueCommentRequest, current_user: dict = Depends(get_current_user)):
    """Field worker adds a comment to an issue they reported."""
    issue = issues_collection.find_one({"_id": ObjectId(issue_id)})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
        
    if issue.get("reported_by") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the reporter can add comments to this issue")
        
    comment_doc = {
        "text": req.comment,
        "added_at": datetime.now(timezone.utc).isoformat(),
        "added_by": current_user.get("fullName")
    }
    
    issues_collection.update_one(
        {"_id": ObjectId(issue_id)},
        {"$push": {"comments": comment_doc}}
    )
    
    return {"message": "Comment added successfully", "comment": comment_doc}


# Notifications endpoints removed


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

    volunteers = list(volunteer_collection.find({
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


@app.get("/api/volunteers/leaderboard")
async def get_leaderboard():
    """Fetch volunteers sorted by points descending."""
    volunteers = list(volunteer_collection.find(
        {"role": "volunteer"}, 
        {"password_hash": 0}
    ).sort("points", -1))
    
    for v in volunteers:
        v["_id"] = str(v["_id"])
        
    return {"leaderboard": volunteers}


# ── Survey Upload (PDF → OCR → AI → DB) ────────────────────────────────────────

@app.post("/api/survey/upload")
async def upload_survey(
    background_tasks: BackgroundTasks,
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

    # Check the created issues and trigger emails for urgent ones
    survey_ids = result.get("survey_ids", [])
    if survey_ids:
        created_issues = list(issues_collection.find({"surid": {"$in": survey_ids}}))
        for issue in created_issues:
            urgency = issue.get("scale of urgency", 1)
            # Both scale of urgency (1-10) and importance (1-100) are possible depending on parsing
            # So check if urgency > 7 or urgency > 70
            if urgency > 7 or urgency > 70:
                background_tasks.add_task(send_urgent_issue_email, issue)

    return {
        "message": f"Survey processed! Found {result['issues_found']} issue(s).",
        "issues_found": result["issues_found"],
        "survey_ids": result["survey_ids"],
        "surveys": result["surveys"],
    }


# Consolidated heatmap endpoint above

# ── Entry Point ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
