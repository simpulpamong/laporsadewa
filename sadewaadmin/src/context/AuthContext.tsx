import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { SessionUser } from '@/types';
import { api } from '@/lib/api';

interface Ctx {
  user: SessionUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isSuper: boolean;
  canAccessCategory: (id: string) => boolean;
}

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sadewa_admin_token'));
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (t: string) => {
    try {
      const r = await api<{ success: true; user: SessionUser }>('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } });
      setUser(r.user); setToken(t);
    } catch {
      localStorage.removeItem('sadewa_admin_token'); setUser(null); setToken(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) hydrate(token); else setLoading(false); }, []); // eslint-disable-line

  const login = async (username: string, password: string) => {
    const r = await api<{ success: true; token: string; user: SessionUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    localStorage.setItem('sadewa_admin_token', r.token); setToken(r.token); setUser(r.user);
    return r.user;
  };
  const logout = async () => {
    if (token) try { await api('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
    localStorage.removeItem('sadewa_admin_token'); setToken(null); setUser(null);
  };
  const refresh = async () => { if (token) await hydrate(token); };
  const isSuper = user?.role === 'superadmin';
  const canAccessCategory = (id: string) => isSuper || Boolean(user?.categoryScopes?.includes(id));

  return <AuthCtx.Provider value={{ user, token, loading, login, logout, refresh, isSuper, canAccessCategory }}>{children}</AuthCtx.Provider>;
}

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
