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

# Load environment variables from the root directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

# Resolve paths relative to this file's directory (backend/)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BACKEND_DIR, "data", "input")
TEMP_IMAGE_DIR = os.path.join(BACKEND_DIR, "data", "temp_images")
RAW_TEXT_FILE = os.path.join(BACKEND_DIR, "data", "output", "raw_extracted_content.txt")
STRUCTURED_OUTPUT_DIR = os.path.join(BACKEND_DIR, "data", "structured_output")

# Ensure directories exist (only for truly temporary processing if needed)
os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)


# ── OPTION A: ORIGINAL OCR PATH (ACTIVE) ────────────────────────────────────
#
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
#
#
def run_ai_structuring(raw_text: str) -> List[Dict[str, Any]]:
    """
    Step 2: Send raw OCR text to Gemini to extract structured survey data.
    Uses the specialized extraction prompt for hand-filled forms.
    """
    import google.generativeai as genai
    import json

    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-2.5-flash")

    prompt = f"""
You are a data extraction specialist for an NGO disaster-relief platform.
Below is raw text extracted via OCR from hand-filled community survey forms.

YOUR TASK:
Identify each individual survey report in the text and extract the fields below into a JSON array.

FIELDS TO EXTRACT (for each survey):
1. type_of_issue (Food | Water | Medical | Logistics | Sanitation/Infrastructure | Education | Other)
2. what_is_the_issue (Concise 1-2 sentence description)
3. date (YYYY-MM-DD or null)
4. landmark (Specific location mentioned)
5. city (Town or City name)
6. district (District name)
7. state (State name)
8. pincode (6-digit PIN code)
9. num_ppl_affected (Integer or null)
10. num_vol_needed (Integer or null)

STRICT RULES:
- Output ONLY a valid JSON array.
- If text is hard to read, make your best guess or use null.
- Do not fabricate data not present or implied in the text.

RAW TEXT:
{raw_text}
"""

    logger.info("AI: Structuring raw OCR text with Gemini...")
    try:
        response = model.generate_content(prompt)
        raw_json = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw_json)
        if isinstance(data, dict):
            data = [data]
        logger.info(f"AI: Successfully structured {len(data)} survey(s)")
        return data
    except Exception as e:
        logger.error(f"AI structuring failed: {e}")
        return []


# ── OPTION B: NEW LIGHTWEIGHT VISION PATH (COMMENTED OUT) ────────────────────

# def convert_pdf_to_images(pdf_path: str) -> List[Any]:
#     """
#     Converts PDF pages to a list of images for Gemini Vision.
#     Uses PyMuPDF (fitz) which is lightweight.
#     """
#     import fitz
#     from PIL import Image
#     import io

#     images = []
#     try:
#         doc = fitz.open(pdf_path)
#         for i in range(len(doc)):
#             page = doc[i]
#             pix = page.get_pixmap(dpi=200) # 200 DPI is enough for AI
#             img_data = pix.tobytes("png")
#             images.append(Image.open(io.BytesIO(img_data)))
#         doc.close()
#     except Exception as e:
#         logger.error(f"PDF Conversion failed: {e}")
#         raise RuntimeError(f"Could not convert PDF to images: {e}")
    
#     return images


# async def run_multimodal_extraction(images: List[Any]) -> List[Dict[str, Any]]:
#     """
#     Sends images directly to Gemini to extract structured data.
#     This replaces BOTH the local OCR (EasyOCR) and the separate structuring step.
#     """
#     import google.generativeai as genai
#     import PIL.Image

#     genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
#     # Use gemini-1.5-flash which is multimodal and very fast
#     model = genai.GenerativeModel("gemini-2.5-flash")

#     prompt = """
# You are a data extraction specialist for an NGO disaster-relief platform.
# Below are images of hand-filled community survey forms.

# YOUR TASK:
# Identify each individual survey report in the images and extract the fields below into a JSON array.

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FIELDS TO EXTRACT (for each survey):
# 1. type_of_issue (Food | Water | Medical | Logistics | Sanitation/Infrastructure | Education | Other)
# 2. what_is_the_issue (Concise description)
# 3. date (YYYY-MM-DD or null)
# 4. landmark (Specific building, school, or landmark like "Govt. Girls Ashram School")
# 5. city (Town or City name)
# 6. district (District name)
# 7. state (State name)
# 8. pincode (6-digit PIN code)
# 9. num_ppl_affected (Integer or null)
# 10. num_vol_needed (Integer or null)

# STRICT RULES:
# - Output ONLY a valid JSON array.
# - "area" is not needed in the JSON; use "district" and "state" instead.
# - If text is hard to read, make your best guess or use null.
# """

#     logger.info(f"AI: Processing {len(images)} page(s) with Gemini Vision...")
    
#     # Combine prompt with images
#     content = [prompt] + images
    
#     try:
#         # response = model.generate_content(content)
#         # raw_json = response.text.replace("```json", "").replace("```", "").strip()
#         # data = json.loads(raw_json)
#         # if isinstance(data, dict):
#         #     data = [data]
#         logger.info(f"AI: Successfully extracted survey(s) using Vision")
#         return []
#     except Exception as e:
#         logger.error(f"AI Multimodal extraction failed: {e}")
#         raise RuntimeError(f"Vision extraction failed: {e}")


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
    DB_NAME = os.getenv("DB_NAME", "dbw_project")
    db = client[DB_NAME]
    issues_collection = db["issues"]
    counters_collection = db["counters"]
    notifications_collection = db["notifications"]
    volunteer_collection = db["volunteer"]
    users_collection = db["users"]

    inserted_ids = []  # We will store surid strings here (e.g. "SUR-001")

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
            "landmark": survey.get("landmark", ""),
            "city": survey.get("city", ""),
            "district": survey.get("district", ""),
            "state": survey.get("state", ""),
            "pincode": survey.get("pincode", ""),
            # "geographical area" is a human-readable summary
            "geographical area": f"{survey.get('landmark', '')}, {survey.get('city', '')}, {survey.get('district', '')}".strip(", "),
            "type of issue": survey.get("type_of_issue") or survey.get("type of issue") or "Other",
            "number of volunteer need": survey.get("number of volunteer need") or survey.get("num_vol_needed") or 1,
            "what is the issue": survey.get("what_is_the_issue") or survey.get("what is the issue") or "",
            "scale of urgency": survey.get("scale of urgency") or 5,
            "req_skillset": survey.get("req_skillset", []),
            "num_ppl_affected": survey.get("num_ppl_affected"),
            "estimated_days": survey.get("estimated_days"),
            "max_points": survey.get("max_points"),
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

        # Insert into database
        result = issues_collection.insert_one(issue_doc)
        real_issue_id_str = str(result.inserted_id)
        inserted_ids.append(surid) # Return surid as expected by other parts of backend

        # Notify nearby volunteers based on urgency
        urgency = survey.get("scale of urgency") or survey.get("urgency") or 5
        if isinstance(urgency, (int, float, str)):
            try:
                urgency_int = int(float(urgency))
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
                    notification_docs.append(
                        {
                            "user_id": str(vol["_id"]),
                            "issue_id": real_issue_id_str, 
                            "surid": surid,
                            "type": "new_issue",
                            "title": f"New {issue_doc['type of issue']} issue from survey!",
                            "message": issue_doc["what is the issue"][:100],
                            "urgency": urgency,
                            "area": issue_doc.get("area", ""),
                            "city": issue_doc.get("city", ""),
                            "read": False,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )

                if notification_docs:
                    notifications_collection.insert_many(notification_docs)
                    logger.info(
                        f"Notified {len(notification_docs)} volunteers for {surid}"
                    )
            except Exception as e:
                logger.warning(f"Could not notify volunteers for {surid}: {e}")

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
    DB_NAME = os.getenv("DB_NAME", "dbw_project")
    db = client[DB_NAME]
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
        # ── OPTION A: ORIGINAL OCR PATH (EasyOCR - Active) ────────────────────
        logger.info("Pipeline Step 1/3: Running OCR...")
        raw_text = run_ocr_on_pdf(temp_pdf_path)
        if not raw_text.strip(): raise RuntimeError("OCR produced no text")
        text_file_id = fs.put(raw_text.encode("utf-8"), filename=f"raw_{unique_name}.txt")
        logger.info("Pipeline Step 2/3: AI structuring...")
        structured_surveys = run_ai_structuring(raw_text)

        # ── OPTION B: NEW VISION PATH (Commented Out) ─────────────────────────
        # logger.info("Pipeline: Using Gemini Vision for extraction...")
        # page_images = convert_pdf_to_images(temp_pdf_path)
        # structured_surveys = await run_multimodal_extraction(page_images)
        # text_file_id = fs.put(b"Extracted via Vision", filename=f"vision_{unique_name}.txt")
        # ──────────────────────────────────────────────────────────────────────

        # Step 2.5: AI Enrichment — fills req_skillset, urgency, estimated_days, max_points
        # This runs enrich_issue on each survey (one Gemini call per survey).
        logger.info("Pipeline Step 2.5/3: Enriching surveys with AI metadata...")
        from model import enrich_issue
        enriched_surveys = []
        for survey in structured_surveys:
            try:
                enriched = await enrich_issue(survey)
                enriched_surveys.append(enriched)
                logger.info(
                    f"  Enriched survey: type={enriched.get('type_of_issue')}, "
                    f"urgency={enriched.get('scale of urgency')}, skills={enriched.get('req_skillset')}"
                )
            except Exception as e:
                logger.warning(f"  Enrichment failed for a survey (using raw): {e}")
                enriched_surveys.append(survey)
        structured_surveys = enriched_surveys

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
        
        # Link the files to the survey IDs
        if survey_ids:
            logger.info(f"Linking GridFS files to {len(survey_ids)} issues...")
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
        else:
            logger.warning("No survey IDs returned from upload_surveys_to_db")

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
