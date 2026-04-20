import os
from pymongo import MongoClient
from dotenv import load_dotenv
import json
from bson import json_util

# Load env from root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

def inspect():
    uri = os.getenv("MONGODB_URI")
    db_name = os.getenv("DB_NAME", "Dbw_project")
    
    if not uri:
        print("Error: MONGODB_URI not found in .env")
        return

    client = MongoClient(uri)
    db = client[db_name]
    
    print(f"\n=== Inspecting Database: {db_name} ===\n")
    
    collections = db.list_collection_names()
    if not collections:
        print("No collections found in this database.")
        return

    coll_name = "issues"
    if coll_name not in collections:
        print(f"Error: Collection '{coll_name}' not found in database.")
        return

    count = db[coll_name].count_documents({})
    print(f"--- Collection: {coll_name} ({count} documents) ---")
    
    # Fetch the 5 most recent documents
    docs = list(db[coll_name].find().sort("_id", -1).limit(5))
    
    if docs:
        # Format for pretty printing (handling ObjectIds and Datetimes)
        formatted_docs = json.loads(json_util.dumps(docs))
        print(json.dumps(formatted_docs, indent=2))
    else:
        print("  [Empty]")
    print("\n")

if __name__ == "__main__":
    inspect()
