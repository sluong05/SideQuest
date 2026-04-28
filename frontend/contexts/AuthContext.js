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

  function loginUser(token, userData) {
    localStorage.setItem('token', token);
    setUser(userData);
    router.push('/');
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
    <AuthContext.Provider value={{ user, loading, loginUser, logoutUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
