import os
import json
import logging
from typing import List, Dict, Any, Optional
from pymongo import MongoClient, errors
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MongoDBManager:
    """Manages MongoDB operations for the DBW Project."""

    def __init__(self, uri: str, db_name: str = "dbw_project"):
        try:
            self.client = MongoClient(uri)
            self.db = self.client[db_name]
            self.surveys_collection = self.db["issues"]
            self.counters_collection = self.db["counters"]
            # Test connection
            self.client.admin.command('ping')
            logger.info("Connected successfully to MongoDB Atlas.")
        except errors.ConnectionFailure as e:
            logger.error(f"Could not connect to MongoDB: {e}")
            raise

    def get_next_sequence_value(self, sequence_name: str) -> str:
        """Increments and returns the next sequence value for auto-incrementing IDs."""
        result = self.counters_collection.find_one_and_update(
            {"_id": sequence_name},
            {"$inc": {"sequence_value": 1}},
            upsert=True,
            return_document=True
        )
        val = result["sequence_value"]
        return f"SUR-{val:03d}"

    def upload_surveys(self, surveys: List[Dict[str, Any]]):
        """Uploads a list of surveys to MongoDB, adding auto-incremented surid."""
        if not surveys:
            logger.warning("No surveys to upload.")
            return

        prepared_surveys = []
        for survey in surveys:
            # Add auto-increment ID
            survey["surid"] = self.get_next_sequence_value("surid")
            prepared_surveys.append(survey)

        try:
            result = self.surveys_collection.insert_many(prepared_surveys)
            logger.info(f"Successfully uploaded {len(result.inserted_ids)} surveys.")
            return result.inserted_ids
        except errors.PyMongoError as e:
            logger.error(f"Error inserting documents: {e}")
            raise

def load_json_data(file_path: str) -> List[Dict[str, Any]]:
    """Loads JSON data from a file."""
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        return []
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                return [data]
            else:
                logger.error("JSON data is not a list or dictionary.")
                return []
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON: {e}")
        return []

def main():
    load_dotenv()
    
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri or "your_mongodb_uri_here" in mongodb_uri:
        logger.error("MONGODB_URI not found in .env. Please update your environment variables.")
        return

    input_file = "./data/structured_output/structured_surveys.json"
    
    logger.info(f"Starting upload from {input_file}...")
    surveys = load_json_data(input_file)
    
    if not surveys:
        logger.info("Nothing to upload. Ensure structure_data.py has generated output.")
        return

    try:
        db_manager = MongoDBManager(mongodb_uri)
        db_manager.upload_surveys(surveys)
        logger.info("Upload process completed.")
    except Exception as e:
        logger.error(f"Failed to complete upload process: {e}")

if __name__ == "__main__":
    main()
