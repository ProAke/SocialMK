import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setWorkspaceId, type User, type Workspace } from './api';

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, editor: 50, analyst: 30 };

interface AuthValue {
  user: User | null;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  role: string;
  workspace: Workspace | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchWorkspace: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  can: (minimum: 'owner' | 'admin' | 'editor' | 'analyst') => boolean;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

interface MeResponse {
  user: User;
  activeWorkspaceId: string;
  role: string;
  workspace: Workspace;
  workspaces: Workspace[];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [role, setRole] = useState('analyst');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const applyMe = useCallback((me: MeResponse) => {
    setUserState(me.user);
    setWorkspaces(me.workspaces);
    setActiveWorkspaceId(me.activeWorkspaceId);
    setRole(me.role);
    setWorkspace(me.workspace);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<MeResponse>('/auth/me');
      applyMe(me);
    } catch {
      setToken(null);
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, [applyMe]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => {
      setToken(null);
      setUserState(null);
      setWorkspaces([]);
    };
    window.addEventListener('socialmk:unauthorized', handler);
    return () => window.removeEventListener('socialmk:unauthorized', handler);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<{
        token: string;
        user: User;
        workspaces: Workspace[];
        activeWorkspaceId: string;
      }>('/auth/login', { email, password });
      setToken(result.token);
      setWorkspaceId(result.activeWorkspaceId);
      const me = await api.get<MeResponse>('/auth/me');
      applyMe({ ...me, user: result.user });
      setLoading(false);
    },
    [applyMe],
  );

  const logout = useCallback(() => {
    setToken(null);
    setWorkspaceId(null);
    setUserState(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setWorkspace(null);
  }, []);

  const switchWorkspace = useCallback(
    async (id: string) => {
      setWorkspaceId(id);
      const me = await api.get<MeResponse>('/auth/me');
      applyMe(me);
      window.location.reload();
    },
    [applyMe],
  );

  const can = useCallback(
    (minimum: 'owner' | 'admin' | 'editor' | 'analyst') => (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minimum] ?? 0),
    [role],
  );

  const value = useMemo(
    () => ({
      user,
      workspaces,
      activeWorkspaceId,
      role,
      workspace,
      loading,
      login,
      logout,
      switchWorkspace,
      refresh,
      can,
      setUser: setUserState,
    }),
    [user, workspaces, activeWorkspaceId, role, workspace, loading, login, logout, switchWorkspace, refresh, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
