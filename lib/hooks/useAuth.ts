import { useCallback } from 'react';
import { useAppState } from '../store';

export const useAuth = () => {
  const state = useAppState();
  const { auth } = state;

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      return { success: true, user: data.user, token: data.token };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Token refresh failed');
      }
      const data = await response.json();
      return { success: true, token: data.token };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, []);

  return {
    isAuthenticated: auth.isAuthenticated,
    user: auth.user,
    loading: auth.loading,
    error: auth.error,
    login,
    logout,
    refreshToken,
  };
};
