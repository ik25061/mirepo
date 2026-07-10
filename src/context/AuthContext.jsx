import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('mirepo_token');
    const savedUser = localStorage.getItem('mirepo_user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      verifyToken(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = useCallback(async (tokenToVerify) => {
    try {
      const data = await api.verifyToken(tokenToVerify);
      setUser(data.user);
      localStorage.setItem('mirepo_user', JSON.stringify(data.user));
    } catch (err) {
      localStorage.removeItem('mirepo_token');
      localStorage.removeItem('mirepo_user');
      setUser(null);
      setToken(null);
      console.error('Error verificando token:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      const data = await api.login(username, password);
      
      if (!data?.success) {
        throw new Error(data?.error || 'Error al iniciar sesión');
      }
      
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('mirepo_token', data.token);
      localStorage.setItem('mirepo_user', JSON.stringify(data.user));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const register = useCallback(async (username, password) => {
    try {
      const data = await api.register(username, password);
      
      if (!data?.success) {
        throw new Error(data?.error || 'Error al registrar usuario');
      }
      
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await api.logout(token);
      }
    } catch (err) {
      console.error('Error en logout:', err);
    }
    
    localStorage.removeItem('mirepo_token');
    localStorage.removeItem('mirepo_user');
    setUser(null);
    setToken(null);
  }, [token]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}