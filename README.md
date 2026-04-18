# Smart Allocator — AI-Powered Resource Management System

Smart Allocator is a modern web application designed for NGOs and community groups to efficiently match volunteers with community needs. It uses Gemini AI for survey processing, MongoDB GridFS for secure file storage, and real-time geo-spatial filtering.

## 🚀 Top Features

- **AI-Powered OCR**: Automatically extracts community issues from hand-filled PDF survey forms using Google Gemini.
- **Smart Volunteer Matching**: Matches tasks to volunteers based on proximity (geo-radius), skills, and availability.
- **Gamified Contributions**: Points-based leaderboard to recognize top contributors.
- **Hierarchical Governance**: Automated "Manager" assignment for tasks based on volunteer experience (points).
- **Secure Cloud Storage**: All uploaded PDFs and extracted data are stored in MongoDB GridFS, mapped directly to field worker profiles.
- **Real-time Notifications**: Nearby volunteers are alerted instantly when a high-urgency issue is reported.

## 🛠 Tech Stack

- **Frontend**: React (Vite), Ant Design (UI), Axios.
- **Backend**: FastAPI (Python), PyMuPDF (OCR), Google Generative AI (Gemini).
- **Database**: MongoDB (Atlas) with GeoJSON indexes and GridFS.

---

## 🏃 Setup Instructions

### 1. Prerequisites
- Node.js (v18+)
- Python (3.9+)
- MongoDB Atlas account (with a GeoJSON index on the `location` field)
- Google Gemini API Key

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:
```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
MAIL_USERNAME=your_email
MAIL_PASSWORD=your_app_password
```

Run the server:
```bash
python server.py
```

### 3. Frontend Setup
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
