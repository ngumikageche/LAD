import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';

type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role_id: string;
  role_name: string | null;
  permissions: Record<string, boolean>;
  institution_id: string | null;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'lad.session.token';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    sessionStorage.setItem(STORAGE_KEY, data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await apiRequest<User>('/auth/me', { token });
        setUser(me);
      } catch {
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, [logout, token]);

  const value = useMemo(() => ({ user, token, isLoading, login, logout }), [user, token, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
