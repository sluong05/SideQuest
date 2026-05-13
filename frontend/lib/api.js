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
export const signup = (email, username, password, timezone) =>
  api.post('/api/auth/signup', { email, username, password, timezone });

export const login = (identifier, password, timezone) =>
  api.post('/api/auth/login', { identifier, password, timezone });

export const getMe = () => api.get('/api/auth/me');

export const setUsername = (username) => api.patch('/api/auth/username', { username });

export const changePassword = (oldPassword, newPassword) =>
  api.patch('/api/auth/password', { oldPassword, newPassword });

export const forgotPassword = (email) =>
  api.post('/api/auth/forgot-password', { email });

export const resetPassword = (token, password) =>
  api.post('/api/auth/reset-password', { token, password });

export const deleteAccount = () => api.delete('/api/auth/account');

export const updateNotifications = (emailReminders) =>
  api.patch('/api/auth/notifications', { emailReminders });

export const verifyEmail = (token) =>
  api.post('/api/auth/verify-email', { token });

export const resendVerification = () =>
  api.post('/api/auth/resend-verification');

export const updateProfile = (bio, avatar) =>
  api.patch('/api/auth/profile', { bio, avatar });

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
export const getLeaderboard = (friends = false) =>
  api.get('/api/leaderboard', { params: friends ? { friends: 'true' } : {} });

// Friends
export const getFriends = () => api.get('/api/friends');
export const getFriendRequests = () => api.get('/api/friends/requests');
export const getFriendFeed = () => api.get('/api/friends/feed');
export const searchUsers = (q) => api.get('/api/friends/search', { params: { q } });
export const sendFriendRequest = (username) => api.post('/api/friends/request', { username });
export const acceptFriendRequest = (id) => api.patch(`/api/friends/${id}/accept`);
export const declineFriendRequest = (id) => api.patch(`/api/friends/${id}/decline`);
export const removeFriend = (id) => api.delete(`/api/friends/${id}`);

// Public profiles
export const getPublicProfile = (username) => api.get(`/api/users/${username}`);

// Challenges
export const getChallenges = () => api.get('/api/challenges');
export const createChallenge = (friendId, type, durationDays) =>
  api.post('/api/challenges', { friendId, type, durationDays });
export const acceptChallenge = (id) => api.patch(`/api/challenges/${id}/accept`);
export const declineChallenge = (id) => api.patch(`/api/challenges/${id}/decline`);

// Shop
export const getShopItems = () => api.get('/api/shop/items');
export const buyShopItem = (itemId, targetUsername) =>
  api.post('/api/shop/buy', { itemId, targetUsername });
export const getInventory = () => api.get('/api/shop/inventory');
export const useItem = (itemId, taskId) =>
  api.post('/api/shop/use', { itemId, ...(taskId !== undefined ? { taskId } : {}) });

// Push notifications
export const getVapidPublicKey = () => api.get('/api/push/vapid-public-key');
export const subscribePush = (endpoint, p256dh, auth) =>
  api.post('/api/push/subscribe', { endpoint, p256dh, auth });
export const unsubscribePush = (endpoint) =>
  api.delete('/api/push/unsubscribe', { data: { endpoint } });

export default api;
