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
    
    # NEW: Cleanup query for specific test user
    target_phone = "7358480256"
    print(f"--- Attempting to delete user with phone: {target_phone} ---")
    
    res1 = db["volunteer"].delete_many({"phone": target_phone})
    res2 = db["field_worker"].delete_many({"phone": target_phone})
    
    print(f"  - Deleted from volunteer: {res1.deleted_count}")
    print(f"  - Deleted from field_worker: {res2.deleted_count}")
    print("\n")

if __name__ == "__main__":
    inspect()
