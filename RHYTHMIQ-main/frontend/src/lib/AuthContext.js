import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '@/lib/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('rhythmiq_token'));
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('rhythmiq_token');
    localStorage.removeItem('rhythmiq_user');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (token) {
      authAPI.me()
        .then(res => setUser(res.data))
        .catch(() => { logout(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, logout]);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password });
    localStorage.setItem('rhythmiq_token', res.data.token);
    localStorage.setItem('rhythmiq_user', JSON.stringify(res.data.user));
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const res = await authAPI.register({ username, email, password });
    // Do NOT auto-authenticate after registration. User must sign in.
    return res.data;
  }, []);

  const googleLogin = useCallback(async (credential) => {
    const res = await authAPI.googleLogin(credential);
    localStorage.setItem('rhythmiq_token', res.data.token);
    localStorage.setItem('rhythmiq_user', JSON.stringify(res.data.user));
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, googleLogin, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};
