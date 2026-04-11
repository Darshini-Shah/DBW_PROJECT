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

# Ensure directories exist
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)
os.makedirs(os.path.dirname(RAW_TEXT_FILE), exist_ok=True)
os.makedirs(STRUCTURED_OUTPUT_DIR, exist_ok=True)


def run_ocr_on_pdf(pdf_path: str) -> str:
    """
    Step 1: Run OCR on a single PDF file using the existing preprocessing logic.
    Returns the extracted raw text.
    """
    from pdf2image import convert_from_path
    import easyocr
    import numpy as np

    POPPLER_PATH = os.getenv("POPPLER_PATH")

    reader = easyocr.Reader(["en"], gpu=False)

    logger.info(f"OCR: Processing {os.path.basename(pdf_path)}...")

    try:
        kwargs = {"pdf_path": pdf_path, "dpi": 300}
        if POPPLER_PATH:
            kwargs["poppler_path"] = POPPLER_PATH
        pages = convert_from_path(**kwargs)
    except Exception as e:
        logger.error(f"OCR: Failed to convert PDF: {e}")
        raise RuntimeError(f"PDF conversion failed: {e}")

    full_text = f"\n\nSOURCE_FILE: {os.path.basename(pdf_path)}\n"

    for i, page in enumerate(pages):
        img_array = np.array(page)
        results = reader.readtext(img_array, detail=0)
        text = " ".join(results)
        full_text += f"\n--- Page {i + 1} ---\n{text}"
        logger.info(f"OCR: Finished page {i + 1}")

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
      2. geographical area: The location or area mentioned.
      3. type of issue: Category of the problem (e.g., Food, Water, Medical, Logistics, Sanitation/Infrastructure).
      4. number of volunteer need: Estimated number of volunteers required (integer).
      5. what is the issue: A short description of the specific problem.
      6. scale of urgency: A value from 1 to 10 (10 being most urgent).
      7. type of volunteer need: Skills or roles required (e.g., Medical Professional, General Labor, Driver).
      8. scale of effect: A value from 1 to 10 (representing amount of people/area affected).

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


def upload_surveys_to_db(
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

        # Add geo-location if reporter has location
        if reporter_location:
            issue_doc["location"] = reporter_location
            coords = reporter_location.get("coordinates", [0, 0])

            # Try to reverse geocode
            try:
                loop = asyncio.new_event_loop()
                geo = loop.run_until_complete(
                    reverse_geocode(coords[1], coords[0])
                )
                loop.close()
                issue_doc["pincode"] = geo.get("pincode", "")
                issue_doc["city"] = geo.get("city", "")
                issue_doc["area"] = geo.get("area", "")
            except Exception:
                issue_doc["pincode"] = ""
                issue_doc["city"] = ""
                issue_doc["area"] = ""

            # Notify nearby volunteers based on urgency
            urgency = survey.get("scale of urgency", 5)
            if isinstance(urgency, (int, float)):
                radius_km = get_radius_km_for_urgency(int(urgency))
                radius_meters = radius_km * 1000

                try:
                    nearby_volunteers = list(
                        users_collection.find(
                            {
                                "role": "volunteer",
                                "location": {
                                    "$nearSphere": {
                                        "$geometry": reporter_location,
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
                                "issue_id": surid,
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

        result = issues_collection.insert_one(issue_doc)
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
    Returns a summary of what was extracted and uploaded.
    """
    # Save the PDF to a temp file
    unique_name = f"{uuid.uuid4().hex}_{filename}"
    pdf_path = os.path.join(INPUT_DIR, unique_name)

    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)

    try:
        # Step 1: OCR
        logger.info("Pipeline Step 1/3: Running OCR...")
        raw_text = run_ocr_on_pdf(pdf_path)

        if not raw_text.strip():
            raise RuntimeError("OCR produced no text from the PDF")

        # Save raw text for reference
        raw_text_path = os.path.join(
            BACKEND_DIR, "data", "output", f"raw_{unique_name}.txt"
        )
        with open(raw_text_path, "w", encoding="utf-8") as f:
            f.write(raw_text)

        # Step 2: AI Structuring
        logger.info("Pipeline Step 2/3: AI structuring with Gemini...")
        structured_surveys = run_ai_structuring(raw_text)

        # Save structured output for reference
        structured_path = os.path.join(
            STRUCTURED_OUTPUT_DIR, f"structured_{unique_name}.json"
        )
        with open(structured_path, "w", encoding="utf-8") as f:
            json.dump(structured_surveys, f, indent=4)

        # Step 3: Upload to MongoDB
        logger.info("Pipeline Step 3/3: Uploading to MongoDB...")
        survey_ids = upload_surveys_to_db(
            structured_surveys, reporter_id, reporter_name, reporter_location
        )

        return {
            "success": True,
            "filename": filename,
            "issues_found": len(structured_surveys),
            "survey_ids": survey_ids,
            "surveys": structured_surveys,
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
        # Clean up the uploaded PDF
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
