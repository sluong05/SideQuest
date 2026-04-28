import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auth
export const signup = (email, username, password) =>
  api.post('/api/auth/signup', { email, username, password });

export const login = (identifier, password) =>
  api.post('/api/auth/login', { identifier, password });

export const getMe = () => api.get('/api/auth/me');

export const setUsername = (username) => api.patch('/api/auth/username', { username });

export const changePassword = (oldPassword, newPassword) =>
  api.patch('/api/auth/password', { oldPassword, newPassword });

export const forgotPassword = (email) =>
  api.post('/api/auth/forgot-password', { email });

export const resetPassword = (token, password) =>
  api.post('/api/auth/reset-password', { token, password });

// Tasks
// Pass { date } for exact-day filter, { upToDate } for overdue+today view
export const getTasks = (params = {}) =>
  api.get('/api/tasks', { params });

export const createTask = (title, dueDate, recurrence = 'none') =>
  api.post('/api/tasks', { title, dueDate, recurrence });

export const completeTask = (taskId) =>
  api.patch(`/api/tasks/${taskId}/complete`);

export const uncompleteTask = (taskId) =>
  api.patch(`/api/tasks/${taskId}/uncomplete`);

export const deleteTask = (taskId) => api.delete(`/api/tasks/${taskId}`);

// Debt
export const getDebt = () => api.get('/api/debt');
export const recalculateDebt = () => api.post('/api/debt/calculate');

// Pushup sessions
export const logPushups = (pushupsCompleted) =>
  api.post('/api/sessions', { pushupsCompleted });

export const getSessions = () => api.get('/api/sessions');

// Streak
export const getStreak = () => api.get('/api/streak');

// Leaderboard
export const getLeaderboard = () => api.get('/api/leaderboard');

export default api;
