"""
Survey Processing Pipeline
Wraps the existing preprocessing → structuring → upload pipeline
into callable functions for the API server.
"""

import os
import json
import logging
import shutil
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Resolve paths relative to this file's directory (backend/)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BACKEND_DIR, "data", "input")
TEMP_IMAGE_DIR = os.path.join(BACKEND_DIR, "data", "temp_images")
RAW_TEXT_FILE = os.path.join(BACKEND_DIR, "data", "output", "raw_extracted_content.txt")
STRUCTURED_OUTPUT_DIR = os.path.join(BACKEND_DIR, "data", "structured_output")

# Ensure directories exist (only for truly temporary processing if needed)
os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)


def run_ocr_on_pdf(pdf_path: str) -> str:
    """
    Step 1: Run OCR on a single PDF file using the existing preprocessing logic.
    Returns the extracted raw text.
    """
    import fitz  # PyMuPDF
    import easyocr
    import numpy as np

    reader = easyocr.Reader(["en"], gpu=False)

    logger.info(f"OCR: Processing {os.path.basename(pdf_path)}...")

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        logger.error(f"OCR: Failed to open PDF: {e}")
        raise RuntimeError(f"PDF open failed: {e}")

    full_text = f"\n\nSOURCE_FILE: {os.path.basename(pdf_path)}\n"

    for i in range(len(doc)):
        page = doc[i]
        pix = page.get_pixmap(dpi=300)
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
        
        if pix.n == 4:
            img_array = img_array[:, :, :3]
            
        results = reader.readtext(img_array, detail=0)
        text = " ".join(results)
        full_text += f"\n--- Page {i + 1} ---\n{text}"
        logger.info(f"OCR: Finished page {i + 1}")

    doc.close()
    return full_text


def run_ai_structuring(raw_text: str) -> List[Dict[str, Any]]:
    """
    Step 2: Send raw OCR text to Gemini to extract structured survey data.
    Returns a list of structured survey dictionaries.
    """
    import google.generativeai as genai

    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-2.5-flash")

    prompt = f"""
    You are an expert data analyst working for an NGO. 
    Below is raw text extracted via OCR from multiple hand-filled community survey forms.
    
    TASK:
    - Identify individual survey reports in the text.
    - Extract the following fields for each survey:
      1. date: The date of the report (use YYYY-MM-DD format if possible).
      2. geographical area: A human-readable description of the location.
      3. landmark: A specific building or spot mentioned.
      4. district: The district or region.
      5. pincode: The 6-digit PIN code.
      6. type of issue: Category (Food, Water, Medical, etc.).
      7. number of volunteer need: Integer.
      8. what is the issue: Short description.
      9. scale of urgency: 1-10.
      10. type of volunteer need: Required skills.
      11. scale of effect: 1-10.

    - If any field is missing, use null.
    - Format the final output as a VALID JSON LIST of objects.

    RAW TEXT:
    {raw_text}
    """

    logger.info("AI: Sending text to Gemini for structuring...")
    response = model.generate_content(prompt)

    raw_json = response.text.replace("```json", "").replace("```", "").strip()

    try:
        data = json.loads(raw_json)
        if isinstance(data, dict):
            data = [data]
        logger.info(f"AI: Extracted {len(data)} survey report(s)")
        return data
    except json.JSONDecodeError as e:
        logger.error(f"AI: Failed to parse JSON: {e}")
        logger.error(f"AI: Raw response: {response.text[:500]}")
        raise RuntimeError(f"AI structuring failed: could not parse response as JSON")


async def upload_surveys_to_db(
    surveys: List[Dict[str, Any]],
    reporter_id: str,
    reporter_name: str,
    reporter_location: Optional[Dict] = None,
) -> List[str]:
    """
    Step 3: Upload structured surveys to MongoDB with geo-tags and auto-IDs.
    Uses the existing MongoDBManager logic enhanced with geo-tagging.
    Returns list of inserted survey IDs.
    """
    from pymongo import MongoClient
    from geocoding import reverse_geocode, get_radius_km_for_urgency
    import asyncio

    MONGODB_URI = os.getenv("MONGODB_URI")
    client = MongoClient(MONGODB_URI)
    db = client["Dbw_project"]
    issues_collection = db["issues"]
    counters_collection = db["counters"]
    notifications_collection = db["notifications"]
    volunteer_collection = db["volunteer"]
    users_collection = db["users"]

    inserted_ids = []

    for survey in surveys:
        # Auto-increment ID
        counter = counters_collection.find_one_and_update(
            {"_id": "surid"},
            {"$inc": {"sequence_value": 1}},
            upsert=True,
            return_document=True,
        )
        surid = f"SUR-{counter['sequence_value']:03d}"

        # Build the issue document
        issue_doc = {
            "surid": surid,
            "date": survey.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
            "geographical area": survey.get("geographical area", ""),
            "type of issue": survey.get("type of issue", "Other"),
            "number of volunteer need": survey.get("number of volunteer need", 1),
            "what is the issue": survey.get("what is the issue", ""),
            "scale of urgency": survey.get("scale of urgency", 5),
            "type of volunteer need": survey.get("type of volunteer need", "General Labor"),
            "scale of effect": survey.get("scale of effect", 5),
            "status": "open",
            "source": "survey_pdf",
            "reported_by": reporter_id,
            "reported_by_name": reporter_name,
            "assigned_volunteers": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # Add geo-location logic
        from geocoding import forward_geocode, reverse_geocode
        
        lat, lng = 0.0, 0.0
        pincode = survey.get("pincode", "")
        city = ""
        area = survey.get("geographical area", "")
        
        # Try to geocode the extracted address
        geo_result = await forward_geocode(
            survey.get("landmark", ""),
            "", # City
            survey.get("district", ""),
            "", # State
            pincode
        )
        
        if geo_result["success"]:
            lat, lng = geo_result["latitude"], geo_result["longitude"]
            pincode = geo_result["pincode"] or pincode
            city = geo_result["city"]
            area = geo_result["area"] or area
            issue_doc["location"] = {"type": "Point", "coordinates": [lng, lat]}
        elif reporter_location:
            # Fallback to reporter location
            issue_doc["location"] = reporter_location
            coords = reporter_location.get("coordinates", [0, 0])
            lng, lat = coords[0], coords[1]
            try:
                geo = await reverse_geocode(lat, lng)
                pincode = pincode or geo.get("pincode", "")
                city = geo.get("city", "")
                area = area or geo.get("area", "")
            except Exception:
                pass
        
        issue_doc["pincode"] = pincode
        issue_doc["city"] = city
        issue_doc["area"] = area # Map uses this for display

        # Notify nearby volunteers based on urgency
        urgency = survey.get("scale of urgency", 5)
        if isinstance(urgency, (int, float, str)):
            try:
                urgency_int = int(urgency)
                radius_km = get_radius_km_for_urgency(urgency_int)
                radius_meters = radius_km * 1000

                nearby_volunteers = list(
                    volunteer_collection.find(
                        {
                            "location": {
                                "$nearSphere": {
                                    "$geometry": issue_doc["location"],
                                    "$maxDistance": radius_meters,
                                }
                            },
                        }
                    )
                )

                notification_docs = []
                for vol in nearby_volunteers:
                    notification_docs.append({
                        "user_id": str(vol["_id"]),
                        "issue_id": str(issue_id),
                        "surid": surid,
                        "type": "new_issue",
                        "title": f"New {issue_doc['type of issue']} issue near you!",
                        "message": f"{issue_doc['what is the issue'][:100]}...",
                        "urgency": urgency_int,
                        "area": area,
                        "city": city,
                        "read": False,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                
                if notification_docs:
                    notifications_collection.insert_many(notification_docs)
                    logger.info(f"Pipeline: Notified {len(notification_docs)} volunteers for {surid}")
            except Exception as e:
                logger.error(f"Pipeline: Notification failed for {surid}: {e}")

        result = issues_collection.insert_one(issue_doc)
        issue_id = result.inserted_id
        inserted_ids.append(surid)
        logger.info(f"Uploaded issue {surid}: {issue_doc['type of issue']}")

    client.close()
    return inserted_ids


async def process_survey_pdf(
    pdf_bytes: bytes,
    filename: str,
    reporter_id: str,
    reporter_name: str,
    reporter_location: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Main pipeline entry point: PDF bytes → OCR → AI structuring → DB upload.
    All files are stored in MongoDB GridFS instead of local folders.
    """
    import gridfs
    from pymongo import MongoClient

    MONGODB_URI = os.getenv("MONGODB_URI")
    client = MongoClient(MONGODB_URI)
    db = client["Dbw_project"]
    fs = gridfs.GridFS(db)

    # Step 0: Create a unique filename and save to GridFS
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_name = f"{timestamp}_{filename}"

    # Store input PDF in GridFS
    pdf_file_id = fs.put(
        pdf_bytes, 
        filename=unique_name, 
        content_type="application/pdf",
        metadata={
            "reporter_id": reporter_id,
            "type": "input_pdf",
            "original_name": filename,
            "timestamp": timestamp
        }
    )
    logger.info(f"GridFS: Saved input PDF with ID {pdf_file_id}")

    # Temporary local save just for OCR (PyMuPDF needs a file path or stream, 
    # but for simplicity of the existing logic we use a temp file)
    temp_pdf_path = os.path.join(TEMP_IMAGE_DIR, f"temp_{unique_name}")
    with open(temp_pdf_path, "wb") as f:
        f.write(pdf_bytes)

    try:
        # Step 1: OCR
        logger.info("Pipeline Step 1/3: Running OCR...")
        raw_text = run_ocr_on_pdf(temp_pdf_path)

        if not raw_text.strip():
            raise RuntimeError("OCR produced no text from the PDF")

        # Store raw text in GridFS
        text_file_id = fs.put(
            raw_text.encode("utf-8"), 
            filename=f"raw_{unique_name}.txt",
            content_type="text/plain",
            metadata={
                "reporter_id": reporter_id,
                "type": "raw_extraction",
                "pdf_id": pdf_file_id
            }
        )
        logger.info(f"GridFS: Saved raw text with ID {text_file_id}")

        # Step 2: AI Structuring
        logger.info("Pipeline Step 2/3: AI structuring with Gemini...")
        structured_surveys = run_ai_structuring(raw_text)

        # Store structured JSON in GridFS
        json_file_id = fs.put(
            json.dumps(structured_surveys, indent=4).encode("utf-8"),
            filename=f"structured_{unique_name}.json",
            content_type="application/json",
            metadata={
                "reporter_id": reporter_id,
                "type": "structured_data",
                "pdf_id": pdf_file_id
            }
        )
        logger.info(f"GridFS: Saved structured JSON with ID {json_file_id}")

        # Step 3: Upload to MongoDB Issues collection
        logger.info("Pipeline Step 3/3: Uploading to MongoDB Issues collection...")
        survey_ids = await upload_surveys_to_db(
            structured_surveys, reporter_id, reporter_name, reporter_location
        )
        
        # Link the files to the survey IDs if needed (optional)
        db["issues"].update_many(
            {"surid": {"$in": survey_ids}},
            {"$set": {
                "gridfs_files": {
                    "pdf_id": str(pdf_file_id),
                    "raw_text_id": str(text_file_id),
                    "structured_json_id": str(json_file_id)
                }
            }}
        )

        return {
            "success": True,
            "filename": filename,
            "issues_found": len(structured_surveys),
            "survey_ids": survey_ids,
            "surveys": structured_surveys,
            "storage_ids": {
                "pdf": str(pdf_file_id),
                "raw_text": str(text_file_id),
                "json": str(json_file_id)
            }
        }

    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        return {
            "success": False,
            "filename": filename,
            "error": str(e),
            "issues_found": 0,
            "survey_ids": [],
        }

    finally:
        # Clean up the temporary local PDF
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
        client.close()
