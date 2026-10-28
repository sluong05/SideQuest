import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getMe } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    getMe()
      .then((res) => {
        setUser(res.data.user);
      })
      .catch(() => {
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, []);

  // loginUser(token) — existing callers. Optional opts:
  //   user:     user object from the auth response (shown immediately; /me
  //             refresh still runs to pick up the full shape)
  //   redirect: where to go afterwards (default '/'; false = stay)
  function loginUser(token, opts = {}) {
    const { user: initialUser, redirect = '/' } = opts || {};
    localStorage.setItem('token', token);
    if (initialUser) setUser(initialUser);
    getMe()
      .then((res) => setUser(res.data.user))
      .catch(() => {});
    if (redirect) router.push(redirect);
  }

  // Re-fetch /api/auth/me (e.g. after settings changes).
  function refreshUser() {
    return getMe()
      .then((res) => { setUser(res.data.user); return res.data.user; })
      .catch(() => null);
  }

  function updateUser(userData) {
    setUser(userData);
  }

  function logoutUser() {
    localStorage.removeItem('token');
    setUser(null);
    router.push('/welcome');
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logoutUser, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
