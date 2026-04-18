"""
matcher.py — Volunteer ↔ Issue Matching Engine
================================================
New flow:
  - For each pending issue, finds ALL qualified volunteers nearby (geo + skill).
  - Invites them all (stores in `assignments` as status="invited").
  - Volunteers see the invitation and can choose to accept via the API.
  - The accept endpoint in server.py enforces the cap: only `num_vol_needed`
    volunteers are allowed to accept. Extras stay as "invited" until the cap is met.
  - Once cap is met, issue status → "ongoing".
"""

import os
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pymongo import MongoClient, errors
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# ── Urgency radius table (mirrors geocoding.py logic) ────────────────────────

def get_radius_km_for_urgency(urgency: int) -> float:
    if urgency <= 3:
        return 5.0
    elif urgency <= 5:
        return 15.0
    elif urgency <= 7:
        return 30.0
    elif urgency <= 9:
        return 60.0
    else:
        return 100.0


# ── Matcher ───────────────────────────────────────────────────────────────────

class VolunteerMatcher:
    """Manages the matching of volunteers to community issues."""

    def __init__(self, uri: str, db_name: str = "dbw_project"):
        try:
            self.client = MongoClient(uri)
            self.db = self.client[db_name]
            self.issues_collection      = self.db["issues"]
            self.volunteers_collection  = self.db["volunteer"]
            self.assignments_collection = self.db["assignments"]
            self.notifications_collection = self.db["notifications"]
            logger.info(f"Connected to database: {db_name}")
        except errors.ConnectionFailure as e:
            logger.error(f"Could not connect to MongoDB: {e}")
            raise

    # ── Fetch pending issues ──────────────────────────────────────────────────

    def get_pending_issues(self) -> List[Dict[str, Any]]:
        """
        Fetch issues that still need more accepted volunteers, sorted by urgency (desc).
        An issue is pending if: accepted_count < num_vol_needed AND status != "ongoing"/"completed"
        """
        all_issues = list(
            self.issues_collection.find(
                {"status": {"$in": ["pending", "open"]}}
            ).sort("scale of urgency", -1)
        )

        pending = []
        for issue in all_issues:
            surid = issue.get("surid")
            num_needed = self._get_vol_needed(issue)

            accepted_count = self.assignments_collection.count_documents(
                {"surid": surid, "status": "accepted"}
            )

            if accepted_count < num_needed:
                issue["_remaining_slots"] = num_needed - accepted_count
                pending.append(issue)

        return pending

    def _get_vol_needed(self, issue: dict) -> int:
        """Safely extract num_vol_needed as int."""
        raw = issue.get("number of volunteer need") or issue.get("num_vol_needed") or 1
        try:
            return max(1, int(raw))
        except (ValueError, TypeError):
            return 1

    # ── Find qualified volunteers ─────────────────────────────────────────────

    def find_qualified_volunteers(self, issue: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Returns all volunteers who are:
          1. Within geo radius (based on issue urgency)
          2. Have at least one skill matching req_skillset
        Falls back to city/area text match if no coordinates.
        """
        req_skills = set(issue.get("req_skillset", []))
        urgency    = int(issue.get("scale of urgency") or 5)
        radius_m   = get_radius_km_for_urgency(urgency) * 1000

        coords = issue.get("location", {}).get("coordinates") if isinstance(issue.get("location"), dict) else None

        # ── Geo query if coordinates exist ────────────────────────────────────
        if coords and len(coords) == 2:
            geo_query = {
                "location": {
                    "$nearSphere": {
                        "$geometry": {
                            "type": "Point",
                            "coordinates": coords,  # [lng, lat]
                        },
                        "$maxDistance": radius_m,
                    }
                }
            }
            try:
                volunteers = list(self.volunteers_collection.find(geo_query))
            except Exception as e:
                logger.warning(f"Geo query failed, falling back to all volunteers: {e}")
                volunteers = list(self.volunteers_collection.find())
        else:
            # ── Fallback: text match on city/area ─────────────────────────────
            area_hint = (issue.get("area") or issue.get("geographical area") or "").lower()
            city_hint = (issue.get("city") or "").lower()
            volunteers = list(self.volunteers_collection.find())
            if area_hint or city_hint:
                volunteers = [
                    v for v in volunteers
                    if area_hint in (v.get("area") or "").lower()
                    or city_hint in (v.get("city") or "").lower()
                ]
            logger.warning(f"Issue {issue.get('surid')} has no coordinates — using text fallback.")

        # ── Skill filter (set intersection) ───────────────────────────────────
        if req_skills:
            volunteers = [
                v for v in volunteers
                if req_skills & set(v.get("skills", []))
            ]

        return volunteers

    # ── Main matching loop ────────────────────────────────────────────────────

    def perform_matching(self):
        """
        For each pending issue:
          1. Find all qualified volunteers (geo + skill).
          2. Invite those not already invited.
          3. Does NOT force-assign — volunteers must accept via the API.
        """
        pending_issues = self.get_pending_issues()
        if not pending_issues:
            logger.info("No pending issues to match.")
            return

        total_invites = 0

        for issue in pending_issues:
            surid       = issue.get("surid")
            issue_id    = str(issue["_id"])
            num_needed  = self._get_vol_needed(issue)
            remaining   = issue["_remaining_slots"]

            logger.info(
                f"Issue {surid} | urgency={issue.get('scale of urgency')} "
                f"| needs {num_needed} | {remaining} slot(s) open"
            )

            # Already invited volunteer ids for this issue (normalize to string)
            already_invited = set(
                str(vid) for vid in self.assignments_collection.distinct("volunteer_id", {"surid": surid})
            )

            qualified = self.find_qualified_volunteers(issue)

            # Only invite the exact number of volunteers required (remaining slots)
            new_invites = [v for v in qualified if str(v["_id"]) not in already_invited][:remaining]

            if not new_invites:
                logger.info(f"  {surid}: No new volunteers to invite.")
                continue

            # Create invitation records
            now = datetime.now(timezone.utc).isoformat()
            invite_docs = []
            notification_docs = []

            for v in new_invites:
                invite_docs.append({
                    "surid":           surid,
                    "issue_id":        issue_id,
                    "volunteer_id":    str(v["_id"]),
                    "volunteer_name":  v.get("fullName", ""),
                    "volunteer_email": v.get("email", ""),
                    "volunteer_phone": v.get("phone", ""),
                    "status":          "invited",   # invited → accepted | declined
                    "invited_at":      now,
                    "accepted_at":     None,
                })

                # Also create a formal notification for the volunteer
                notification_docs.append({
                    "user_id": str(v["_id"]),
                    "issue_id": issue_id,
                    "surid": surid,
                    "type": "new_invite",
                    "title": f"You were invited to help with {issue.get('type of issue')}",
                    "message": f"We need your specific skills for an issue reported at {issue.get('geographical area')}.",
                    "urgency": issue.get("scale of urgency", 5),
                    "area": issue.get("area", ""),
                    "city": issue.get("city", ""),
                    "read": False,
                    "created_at": now,
                })

            if invite_docs:
                self.assignments_collection.insert_many(invite_docs)
            if notification_docs:
                self.notifications_collection.insert_many(notification_docs)
                
            total_invites += len(invite_docs)

            logger.info(
                f"  {surid}: Invited {len(invite_docs)} exactly matched volunteer(s) "
                f"(remaining needs: {remaining})"
            )

        logger.info(f"Matching session complete. Total new invitations sent: {total_invites}")

    def close(self):
        self.client.close()


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    load_dotenv()
    mongodb_uri = os.getenv("MONGODB_URI")

    if not mongodb_uri:
        logger.error("MONGODB_URI not found in .env")
        return

    try:
        matcher = VolunteerMatcher(mongodb_uri)
        matcher.perform_matching()
        matcher.close()
    except Exception as e:
        logger.error(f"Matching process failed: {e}")


if __name__ == "__main__":
    main()
