import os
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from pymongo import MongoClient, errors
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class VolunteerMatcher:
    """Manages the matching of volunteers to community issues."""

    def __init__(self, uri: str, db_name: str = "Dbw_project"):
        try:
            self.client = MongoClient(uri)
            self.db = self.client[db_name]
            self.issues_collection = self.db["issues"]
            self.volunteers_collection = self.db["volunteer"]
            self.assignments_collection = self.db["assignments"]
            logger.info(f"Connected to database: {db_name}")
        except errors.ConnectionFailure as e:
            logger.error(f"Could not connect to MongoDB: {e}")
            raise

    def get_unassigned_volunteers(self) -> List[Dict[str, Any]]:
        """Fetch volunteers who are not yet in the assignments collection."""
        # 1. Get all assigned volunteer IDs
        assigned_ids = self.assignments_collection.distinct("_id")
        
        # 2. Query volunteers whose _id is not in that list
        query = {"_id": {"$nin": assigned_ids}}
        return list(self.volunteers_collection.find(query))

    def get_pending_issues(self) -> List[Dict[str, Any]]:
        """Fetch issues that don't have enough assignments yet, sorted by urgency."""
        # For simplicity, we'll fetch all issues and filter those already fully assigned
        # Logic: If surid is in assignments 'number of volunteer need' times, it's fulfilled.
        
        all_issues = list(self.issues_collection.find().sort("scale of urgency", -1))
        pending_issues = []
        
        for issue in all_issues:
            surid = issue.get("surid")
            required = issue.get("number of volunteer need", 1)
            # Ensure required is an int
            try:
                required = int(required) if required is not None else 1
            except ValueError:
                required = 1
                
            current_assignments = self.assignments_collection.count_documents({"surid": surid})
            
            if current_assignments < required:
                issue["remaining_need"] = required - current_assignments
                pending_issues.append(issue)
        
        return pending_issues

    def find_match(self, issue: Dict[str, Any], available_volunteers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Finds the best volunteer match based on Location and Skills."""
        issue_location = issue.get("geographical area", "").lower()
        issue_skills_needed = issue.get("type of volunteer need", "").lower()
        
        best_match = None
        
        # 1. Try to match both Location AND Skills
        for vol in available_volunteers:
            vol_location = vol.get("Location", "").lower()
            vol_skills = vol.get("Skills", "").lower()
            
            if issue_location in vol_location or vol_location in issue_location:
                if any(skill.strip() in vol_skills for skill in issue_skills_needed.split(",")):
                    return vol

        # 2. Fallback: Match by Location only
        for vol in available_volunteers:
            vol_location = vol.get("Location", "").lower()
            if issue_location in vol_location or vol_location in issue_location:
                return vol
                
        # 3. Last resort: Return first available (if you want to ensure any assignment)
        # return available_volunteers[0] if available_volunteers else None
        return None

    def perform_matching(self):
        """Main matching loop."""
        pending_issues = self.get_pending_issues()
        if not pending_issues:
            logger.info("No pending issues found for matching.")
            return

        available_volunteers = self.get_unassigned_volunteers()
        if not available_volunteers:
            logger.info("No available volunteers found.")
            return

        assignments_made = 0
        
        for issue in pending_issues:
            surid = issue.get("surid")
            remaining = issue.get("remaining_need", 1)
            
            logger.info(f"Processing Issue {surid} (Urgency: {issue.get('scale of urgency')}, Needs: {remaining})")
            
            for _ in range(remaining):
                if not available_volunteers:
                    break
                    
                match = self.find_match(issue, available_volunteers)
                
                if match:
                    # Create assignment
                    assignment = {
                        "surid": surid,
                        "volunteer_id": match.get("_id"),
                        "volunteer_name": match.get("Volunteer Name"),
                        "issue_description": issue.get("what is the issue"),
                        "geographical area": issue.get("geographical area"),
                        "assigned_at": datetime.now(),
                        "status": "Assigned"
                    }
                    
                    self.assignments_collection.insert_one(assignment)
                    logger.info(f"  Successfully assigned {match.get('Volunteer Name')} to {surid}")
                    
                    # Remove from available list for this session
                    available_volunteers.remove(match)
                    assignments_made += 1
                else:
                    logger.warning(f"  No suitable match found for {surid}")
                    break # Stop trying to fill this issue if no matches found
                    
        logger.info(f"Matching session complete. Total assignments made: {assignments_made}")

def main():
    load_dotenv()
    mongodb_uri = os.getenv("MONGODB_URI")
    
    if not mongodb_uri:
        logger.error("MONGODB_URI not found in .env")
        return

    try:
        matcher = VolunteerMatcher(mongodb_uri)
        matcher.perform_matching()
    except Exception as e:
        logger.error(f"Error during matching process: {e}")

if __name__ == "__main__":
    main()
