import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ────────────────────────────────────────

export const registerUser = async (data) => {
  const res = await api.post('/auth/register', data);
  const { token, user } = res.data;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  return { token, user };
};

export const loginUser = async (email, password, role) => {
  const res = await api.post('/auth/login', { email, password, role });
  const { token, user } = res.data;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  return { token, user };
};

export const sendOTP = async (email) => {
  const res = await api.post('/auth/send-otp', { email });
  return res.data;
};

export const verifyOTP = async (email, otp) => {
  const res = await api.post('/auth/verify-otp', { email, otp });
  return res.data;
};

export const getMe = async () => {
  const res = await api.get('/auth/me');
  return res.data.user;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// ── Issues ──────────────────────────────────────

export const getIssues = async (params = {}) => {
  const res = await api.get('/api/issues', { params });
  return res.data;
};

export const createIssue = async (data) => {
  const res = await api.post('/api/issues', data);
  return res.data;
};

export const acceptIssue = async (issueId) => {
  const res = await api.post(`/api/issues/${issueId}/accept`);
  return res.data;
};

// ── Notifications removed

// ── Survey Upload ───────────────────────────────

export const uploadSurveyPDF = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/api/survey/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 min timeout for OCR + AI processing
  });
  return res.data;
};

// ── Volunteers ──────────────────────────────────

export const getNearbyVolunteers = async (params = {}) => {
  const res = await api.get('/api/volunteers/nearby', { params });
  return res.data;
};

export const getLeaderboard = async () => {
  const res = await api.get('/api/volunteers/leaderboard');
  return res.data;
};

export const getMyTasks = async () => {
  const res = await api.get('/api/issues/my-tasks');
  return res.data;
};

export const updateVolunteerDays = async (issueId, volunteerId, days) => {
  const res = await api.post(`/api/issues/${issueId}/update-days`, { volunteer_id: volunteerId, days });
  return res.data;
};

export const completeTask = async (issueId) => {
  const res = await api.post(`/api/issues/${issueId}/complete`);
  return res.data;
};

export const startTask = async (issueId) => {
  const res = await api.post(`/api/issues/${issueId}/start`);
  return res.data;
};

export default api;
