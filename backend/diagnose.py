"""
diagnose.py — Inspect DB for filter debugging
Run: python diagnose.py
"""
import os, json
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
uri = os.getenv("MONGODB_URI")
db_name = os.getenv("DB_NAME", "Dbw_project")
client = MongoClient(uri)
db = client[db_name]

print(f"\n=== DB: {db_name} ===\n")

# ── Issues ────────────────────────────────────────────────────────────
issues = list(db["issues"].find({}, {
    "surid": 1, "type of issue": 1, "status": 1,
    "location": 1, "req_skillset": 1, "_id": 0
}))
print(f"ISSUES ({len(issues)} total):")
for iss in issues:
    loc = iss.get("location")
    coords = loc.get("coordinates") if isinstance(loc, dict) else None
    has_valid_loc = coords and len(coords) == 2 and not (coords[0] == 0 and coords[1] == 0)
    skills = iss.get("req_skillset", [])
    print(f"  {iss.get('surid'):<10} status={iss.get('status'):<10} "
          f"has_location={has_valid_loc!s:<6} "
          f"req_skillset={skills}")

print()

# ── Volunteers ────────────────────────────────────────────────────────
vols = list(db["volunteer"].find({}, {
    "email": 1, "skills": 1, "location": 1, "_id": 0
}))
print(f"VOLUNTEERS ({len(vols)} total):")
for v in vols:
    loc = v.get("location")
    coords = loc.get("coordinates") if isinstance(loc, dict) else None
    has_valid_loc = coords and len(coords) == 2 and not (coords[0] == 0 and coords[1] == 0)
    print(f"  {v.get('email'):<35} has_location={has_valid_loc!s:<6} skills={v.get('skills', [])}")

print()

# ── Index check ────────────────────────────────────────────────────────
print("INDEXES on 'issues' collection:")
for idx in db["issues"].index_information().values():
    print(f"  {idx['name']}: {idx['key']}")

print("\nINDEXES on 'volunteer' collection:")
for idx in db["volunteer"].index_information().values():
    print(f"  {idx['name']}: {idx['key']}")

client.close()
