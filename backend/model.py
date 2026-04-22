"""
model.py — Issue Field Enrichment
==================================
Takes a partially-filled issue document (as extracted from OCR + structure_data.py)
and fills in missing/empty fields using:
  - ONE single Gemini LLM call  (type_of_issue, urgency, num_ppl_affected, num_vol_needed, req_skillset)
  - Deterministic formulas       (estimated_days, max_points)
  - Geocoding via Nominatim      (coordinates)

Usage (standalone):
    from model import enrich_issue
    enriched = await enrich_issue(issue_doc)

Does NOT modify any other file. No side effects.
"""

import os
import re
import json
import logging
import httpx
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

SKILL_OPTIONS = [
    "Medical Support",
    "Logistics/Delivery",
    "Teaching",
    "Construction/Repairs",
    "Language Translation",
    "Cooking",
    "Counseling",
    "Driving",
    "First Aid",
    "IT Support",
]

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


# ── Formula-based helpers ────────────────────────────────────────────────────

def compute_estimated_days(urgency: float) -> float:
    """Formula: estimated_days = ((1.4 * u) + 1) * 1.2"""
    return round(((1.4 * urgency) + 1) * 1.2, 2)


def compute_max_points(urgency: float, estimated_days: float) -> float:
    """Formula: max_points = urgency * estimated_days"""
    return round(urgency * estimated_days, 2)


def compute_urgency_fallback(
    type_of_issue: Optional[str],
    num_ppl_affected: Optional[int],
) -> float:
    """
    FALLBACK ONLY — simple formula if Gemini call fails.
    urgency = clip(type_weight + 0.005 * ppl, 1, 10)
    """
    WEIGHTS = {
        "medical": 7.0, "food": 6.0, "water": 6.5,
        "sanitation": 5.0, "infrastructure": 4.0,
        "logistics": 4.0, "education": 3.0, "other": 3.0,
    }
    issue_lower = (type_of_issue or "").lower()
    base = 3.0
    for key, w in WEIGHTS.items():
        if key in issue_lower:
            base = w
            break
    ppl_bonus = min(3.0, 0.005 * float(num_ppl_affected or 0))
    return round(max(1.0, min(10.0, base + ppl_bonus)), 1)


# ── Single LLM call ──────────────────────────────────────────────────────────

def llm_enrich_fields(
    type_of_issue: Optional[str],
    what_is_the_issue: Optional[str],
    num_ppl_affected: Optional[int],
    num_vol_needed: Optional[int],
    area: Optional[str],
) -> dict:
    """
    ONE single Gemini call that fills all LLM-derived fields at once:
      - type_of_issue   (short clean label)
      - urgency         (1–10 float, function of issue type + ppl affected)
      - num_ppl_affected (estimate only if input was None)
      - num_vol_needed   (estimate only if input was None)
      - req_skillset     (list from predefined options)

    Returns a dict with these keys. Any field that fails will be None / [].
    """
    import google.generativeai as genai
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-2.5-flash")

    skills_list = ", ".join(SKILL_OPTIONS)
    ppl_context = str(num_ppl_affected) if num_ppl_affected is not None else "NOT STATED — estimate it"
    vol_context = str(num_vol_needed) if num_vol_needed is not None else "NOT STATED — estimate it"

    prompt = f"""
You are an AI analyst for an NGO disaster-relief platform.
Given the community issue details below, return a JSON object with ALL of the following fields filled in.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INPUT CONTEXT:
  Issue Type (raw)    : {type_of_issue or "unknown"}
  Description         : {what_is_the_issue or "not provided"}
  Area                : {area or "unknown"}
  People Affected     : {ppl_context}
  Volunteers Needed   : {vol_context}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIELDS TO RETURN (JSON object):

1. "type_of_issue"
   Pick exactly ONE short label from:
   Food | Water | Medical | Logistics | Sanitation/Infrastructure | Education | Other

2. "urgency"
   A float from 1.0 to 10.0.
   Base this PRIMARILY on issue type and number of people affected.
   Medical/Water/Food crises with many people = high urgency.
   Infrastructure with few people = lower urgency.

3. "num_ppl_affected"
   Integer estimate of people directly affected.
   - If "People Affected" above says NOT STATED, estimate based on context.
   - If it was given, just return that same number.

4. "num_vol_needed"
   Integer estimate of volunteers needed.
   - If "Volunteers Needed" above says NOT STATED, estimate based on context.
   - If it was given, just return that same number.

5. "req_skillset"
   JSON array of skills needed. Pick ONLY from this exact list your output must omly be from here nothing else:
   {skills_list}
   Return at least 1 skill. Return [] if truly none apply, only words from this list will be considered.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPOND WITH ONLY A VALID JSON OBJECT. No explanation, no markdown fences.

Example:
{{
  "type_of_issue": "Medical",
  "urgency": 8.5,
  "num_ppl_affected": 120,
  "num_vol_needed": 6,
  "req_skillset": ["Medical Support", "First Aid"]
}}
"""

    try:
        response = model.generate_content(prompt)
        raw = response.text.replace("```json", "").replace("```", "").strip()
        result = json.loads(raw)

        # Validate and clamp urgency
        urgency = float(result.get("urgency", 5.0))
        result["urgency"] = round(max(1.0, min(10.0, urgency)), 1)

        # Filter skillset to only valid options
        raw_skills = result.get("req_skillset", [])
        result["req_skillset"] = [s for s in raw_skills if s in SKILL_OPTIONS]

        # Ensure integers
        if result.get("num_ppl_affected") is not None:
            result["num_ppl_affected"] = int(result["num_ppl_affected"])
        if result.get("num_vol_needed") is not None:
            result["num_vol_needed"] = int(result["num_vol_needed"])

        logger.info(f"[LLM single call] enriched: urgency={result['urgency']}, "
                    f"ppl={result.get('num_ppl_affected')}, vol={result.get('num_vol_needed')}, "
                    f"skills={result.get('req_skillset')}")
        return result

    except Exception as e:
        logger.warning(f"[LLM single call] failed: {e}")
        return {}


# ── Geocoding helper ─────────────────────────────────────────────────────────

async def geocode_location(area: str, city: str, pincode: str) -> Optional[list]:
    """
    Forward geocodes area/city/pincode to [longitude, latitude] using Nominatim.
    Returns [lng, lat] (GeoJSON order) or None if lookup fails.
    """
    query_parts = [p for p in [area, city, pincode, "India"] if p]
    query = ", ".join(query_parts)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                NOMINATIM_URL,
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "SmartAllocator/1.0"},
                timeout=10.0,
            )
            response.raise_for_status()
            results = response.json()
            if results:
                lat = float(results[0]["lat"])
                lon = float(results[0]["lon"])
                logger.info(f"[GEOCODE] '{query}' → [{lon}, {lat}]")
                return [lon, lat]
    except Exception as e:
        logger.warning(f"[GEOCODE] failed for '{query}': {e}")

    return None


# ── Main enrichment function ─────────────────────────────────────────────────

async def enrich_issue(issue: dict) -> dict:
    """
    Takes a partially-filled issue document and fills all missing fields.

    Makes exactly ONE LLM call for: type_of_issue, urgency, num_ppl_affected,
                                     num_vol_needed, req_skillset.
    Then applies formulas for: estimated_days, max_points.
    Then geocodes: coordinates.

    Returns enriched dict. Does not write to MongoDB.
    """
    doc = dict(issue)

    def is_missing(val):
        return val is None or val == "" or val == [] or val == {}

    # ── Gather existing context from PDF extraction ───────────────────────────
    type_of_issue  = doc.get("type_of_issue") or doc.get("type of issue") or None
    description    = doc.get("what_is_the_issue") or doc.get("what is the issue") or None
    num_ppl        = doc.get("num_ppl_affected") or None
    num_vol        = doc.get("num_vol_needed") or doc.get("number of volunteer need") or None
    area           = doc.get("area") or doc.get("geographical area") or None
    city           = doc.get("city") or None
    pincode        = doc.get("pincode") or None

    # Decide which fields are already filled (never overwrite what came from PDF)
    need_type    = is_missing(type_of_issue) or len(str(type_of_issue)) > 30
    need_ppl     = is_missing(num_ppl)
    need_vol     = is_missing(num_vol)
    need_urgency = is_missing(doc.get("scale of urgency") or doc.get("urgency"))
    need_skills  = is_missing(doc.get("req_skillset"))

    # ── Single LLM call ───────────────────────────────────────────────────────
    llm_result = {}
    if any([need_type, need_urgency, need_ppl, need_vol, need_skills]):
        llm_result = llm_enrich_fields(
            type_of_issue=type_of_issue,
            what_is_the_issue=description,
            num_ppl_affected=num_ppl if not need_ppl else None,
            num_vol_needed=num_vol if not need_vol else None,
            area=area,
        )

    # ── Apply LLM results (only if field was missing) ─────────────────────────
    if need_type and llm_result.get("type_of_issue"):
        doc["type_of_issue"] = llm_result["type_of_issue"]
        type_of_issue = llm_result["type_of_issue"]

    # Ensure canonical key exists
    doc["type_of_issue"] = doc.get("type_of_issue") or doc.get("type of issue") or "Other"
    type_of_issue = doc["type_of_issue"]

    if need_urgency:
        urgency = llm_result.get("urgency")
        if urgency is None:
            urgency = compute_urgency_fallback(type_of_issue, num_ppl)
            logger.info(f"[FORMULA fallback] urgency → {urgency}")
        doc["scale of urgency"] = urgency
    else:
        try:
            urgency = float(doc.get("scale of urgency") or doc.get("urgency") or 5.0)
        except (ValueError, TypeError):
            urgency = 5.0
        doc["scale of urgency"] = urgency

    if need_ppl and llm_result.get("num_ppl_affected") is not None:
        doc["num_ppl_affected"] = llm_result["num_ppl_affected"]

    if need_vol and llm_result.get("num_vol_needed") is not None:
        doc["number of volunteer need"] = llm_result["num_vol_needed"]

    if need_skills and llm_result.get("req_skillset"):
        doc["req_skillset"] = llm_result["req_skillset"]

    # ── Geocode coordinates ───────────────────────────────────────────────────
    existing_location = doc.get("location", {})
    existing_coords = existing_location.get("coordinates") if isinstance(existing_location, dict) else None
    if is_missing(existing_coords):
        coords = await geocode_location(area or "", city or "", pincode or "")
        if coords:
            doc["location"] = {"type": "Point", "coordinates": coords}

    # ── Formula: estimated_days ───────────────────────────────────────────────
    urgency = float(doc.get("scale of urgency", 5.0))
    if is_missing(doc.get("estimated_days")):
        doc["estimated_days"] = compute_estimated_days(urgency)
        logger.info(f"[FORMULA] estimated_days → {doc['estimated_days']}")

    # ── Formula: max_points ───────────────────────────────────────────────────
    if is_missing(doc.get("max_points")):
        doc["max_points"] = compute_max_points(urgency, doc["estimated_days"])
        logger.info(f"[FORMULA] max_points → {doc['max_points']}")

    return doc


# ── Standalone test ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    test_issue = {
        "surid": "SUR-001",
        "date": "2026-04-18",
        "area": "Velachery",
        "city": "Chennai",
        "pincode": "600042",
        "type_of_issue": None,                # Missing → LLM
        "what_is_the_issue": "Heavy flooding has left 3 streets inaccessible. Several elderly residents report respiratory issues.",
        "scale of urgency": None,              # Missing → LLM
        "number of volunteer need": None,      # Missing → LLM
        "num_ppl_affected": None,              # Missing → LLM
        "req_skillset": None,                  # Missing → LLM
        "location": {},                        # Missing → Geocoding
        "status": "pending",
        "source": "pdf_survey",
    }

    async def run():
        enriched = await enrich_issue(test_issue)
        print("\n── Enriched Issue ──────────────────────────────────")
        print(json.dumps(enriched, indent=2, default=str))

    asyncio.run(run())
