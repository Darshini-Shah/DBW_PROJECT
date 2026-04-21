# DBW Project — Smart Allocator

A geo-aware NGO resource allocation platform that connects **field workers** and **volunteers** to community issues in real time.

---

## Project Structure

```
DBW_PROJECT/
├── backend/                  # FastAPI backend
│   ├── server.py             # Main API server (auth, issues, notifications)
│   ├── pipeline.py           # PDF → OCR → AI → MongoDB upload pipeline
│   ├── model.py              # Issue field enrichment (formulas + LLM)
│   ├── structure_data.py     # Raw OCR text → structured JSON (Gemini)
│   ├── geocoding.py          # GPS ↔ address via OpenStreetMap Nominatim
│   ├── matcher.py            # Volunteer ↔ issue matching engine
│   ├── db_uploader.py        # Bulk CSV upload to MongoDB
│   ├── preprocessing.py      # PDF OCR preprocessing
│   └── requirements.txt      # Python dependencies
│
└── frontend/                 # React + Vite frontend
    └── src/
        └── pages/
            ├── RoleSelection.jsx       # Landing: choose Volunteer or Field Worker
            ├── LoginPage.jsx           # Login
            ├── RegisterVolunteer.jsx   # Volunteer registration + skill selection
            ├── RegisterFieldWorker.jsx # Field worker registration
            ├── Volunteer.jsx           # Volunteer dashboard (view & accept issues)
            ├── FieldWorker.jsx         # Field worker dashboard (report issues, upload PDFs)
            ├── MyTasks.jsx             # Volunteer's active tasks
            └── Leaderboard.jsx         # Gamification leaderboard
```

---

## Backend

### Tech Stack

| Tool | Purpose |
|---|---|
| **FastAPI** | REST API framework |
| **MongoDB** | Primary database (via `pymongo`) |
| **Gemini 2.5 Flash** | AI structuring + field enrichment |
| **EasyOCR + PyMuPDF** | PDF text extraction |
| **OpenStreetMap Nominatim** | Reverse/forward geocoding |
| **python-jose** | JWT authentication |
| **fastapi-mail** | OTP email delivery |

### Setup

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in the project root:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_jwt_secret
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_app_password
MAIL_FROM=your_email@gmail.com
```

### Running the Server

```bash
cd backend
python server.py
```

API runs at `http://localhost:8000`
Swagger docs at `http://localhost:8000/docs`

---

### Key Backend Modules

#### `server.py` — API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/auth/send-otp` | POST | Send OTP to email |
| `/auth/verify-otp` | POST | Verify OTP |
| `/auth/register` | POST | Register volunteer / field worker |
| `/auth/login` | POST | Login and receive JWT |
| `/auth/me` | GET | Get current user profile |
| `/api/issues` | GET | Fetch nearby issues (geo-filtered) |
| `/api/issues` | POST | Field worker: report a new issue |
| `/api/issues/{id}/accept` | POST | Volunteer: accept/claim an issue |
| `/api/notifications` | GET | Fetch unread notifications |
| `/api/notifications/mark-read` | POST | Mark all notifications as read |
| `/api/volunteers/nearby` | GET | Fetch nearby volunteers |
| `/api/survey/upload` | POST | Upload a PDF survey (triggers full pipeline) |

---

#### `pipeline.py` — PDF Survey Pipeline

Processes uploaded PDF surveys end-to-end:

```
PDF Upload → OCR (EasyOCR + PyMuPDF) → AI Structuring (Gemini) → Enrich (model.py) → MongoDB
```

Output files are named by timestamp: `20260418_1245_survey.pdf.txt`

---

#### `model.py` — Issue Field Enrichment

Fills in missing fields on a raw issue document after extraction. Called automatically by the pipeline. Can also be imported standalone:

```python
from model import enrich_issue
enriched = await enrich_issue(raw_issue_doc)
```

| Field | Method | Logic |
|---|---|---|
| `type of issue` | 🤖 LLM | Classifies to short label (Food / Medical / Water / etc.) |
| `scale of urgency` | 📐 Formula | `clip(0.5×effect + type_weight + 0.1×vol_count, 1, 10)` |
| `num_ppl_affected` | 🤖 LLM | Gemini estimates from description + area |
| `num_vol_needed` | 🤖 LLM | Gemini estimates from type, description, urgency |
| `req_skillset` | 🤖 LLM | Picked from predefined skill options |
| `coordinates` | 🌍 Geocoding | Nominatim forward-geocodes area + city + pincode |
| `estimated_days` | 📐 Formula | `((1.4 × urgency) + 1) × 1.2` |
| `max_points` | 📐 Formula | `urgency × estimated_days` |

---

#### `matcher.py` — Volunteer Matching

Matches unassigned volunteers to pending issues based on location and skillset.

```bash
python matcher.py
```

---

## Frontend

### Tech Stack

| Tool | Purpose |
|---|---|
| **React + Vite** | UI framework |
| **Vanilla CSS** | Styling |

### Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 📂 Project Structure

### Backend
- `server.py`: Main FastAPI application, auth logic, and API endpoints.
- `pipeline.py`: Handles PDF → OCR → Gemini → GridFS workflow.
- `matcher.py`: Batch matching algorithm for volunteers and issues.
- `geocoding.py`: Utilities for reverse geocoding and radius calculation.

### Frontend
- `/src/pages/Volunteer.jsx`: Dashboard for finding and accepting nearby tasks.
- `/src/pages/MyTasks.jsx`: Manager control panel for tracking progress.
- `/src/pages/Leaderboard.jsx`: Community ranking system.
- `/src/pages/FieldWorker.jsx`: PDF upload and AI extraction interface.

---

## 🏗 Storage Architecture
We have migrated from local file storage to **MongoDB GridFS**. 
- **Files Stored**: Input PDFs, Raw OCR text, and Structured JSON reports.
- **Mapping**: Each file is metadata-tagged with the `reporter_id` (Field Worker) to ensure complete auditability and ownership.

## 🏆 Contribution Points Logic
- **Daily Participation**: 1 credit given by the Task Manager for every day worked.
- **Reward**: Finalized tasks award **(Days Worked × 5)** points to each participant.
- **Manager Eligibility**: The volunteer with the highest points in a team is automatically promoted to Task Manager.

---

## 🔒 Security
- **JWT Authentication**: Secure role-based access for Volunteers and Field Workers.
- **Email Verification**: OTP-based verification for new registrations.
- **Geo-privacy**: Coordinates are processed securely for radius filtering.

Developed with ❤️ for the community.
Frontend runs at `http://localhost:5173`

---

### Pages

| Page | Role | Description |
|---|---|---|
| `RoleSelection` | All | Choose between Volunteer and Field Worker |
| `LoginPage` | All | Login with JWT auth |
| `RegisterVolunteer` | Volunteer | Sign up with skills, availability, location |
| `RegisterFieldWorker` | Field Worker | Sign up with location |
| `Volunteer` | Volunteer | Browse and accept nearby issues |
| `FieldWorker` | Field Worker | Report issues, upload PDF surveys |
| `MyTasks` | Volunteer | View currently accepted tasks |
| `Leaderboard` | Volunteer | Points-based volunteer rankings |

---

## MongoDB Collections

| Collection | Description |
|---|---|
| `volunteer` | Registered volunteers |
| `field_worker` | Registered field workers |
| `issues` | Community issue reports |
| `otp_registry` | Active OTP records (TTL indexed) |
| `notifications` | Per-user issue alerts |
| `assignments` | Volunteer ↔ issue assignment records |
| `counters` | Auto-increment counters (e.g., SUR-001) |

---

## Issue Document Schema

```json
{
  "surid": "SUR-001",
  "source": "pdf_survey",
  "reported_by": "<field_worker_id>",
  "created_at": "2026-04-18T07:15:00Z",

  "location": { "type": "Point", "coordinates": [80.22, 12.97] },
  "area": "Velachery",
  "city": "Chennai",
  "pincode": "600042",

  "type of issue": "Medical",
  "what is the issue": "Elderly residents with respiratory issues after flooding",
  "scale of urgency": 8,
  "num_ppl_affected": 120,

  "status": "pending",
  "number of volunteer need": 5,
  "req_skillset": ["Medical Support", "First Aid"],
  "start_date": null,
  "end_date": null,

  "estimated_days": 12.48,
  "max_points": 99.84
}
```

---

## Skill Options (Volunteer Matching)

```
Medical Support | Logistics/Delivery | Teaching | Construction/Repairs
Language Translation | Cooking | Counseling | Driving | First Aid | IT Support
```

---

## Gamification Formulas

```
estimated_days = ((1.4 × urgency) + 1) × 1.2
max_points     = urgency × estimated_days
```

---

## Notes

- The `jose` package (Python 2) must **not** be installed. Use `python-jose[cryptography]` instead.
- `scikit-image 0.26+` requires Python 3.11+. If you are on Python 3.10, `scikit-image>=0.25.0` is installed automatically.
- PDF output files are named by upload timestamp: `YYYYMMDD_HHMMSS_filename.pdf.txt`
