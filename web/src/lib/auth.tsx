import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  applyToken: (token: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyToken = useCallback(async (token: string) => {
    localStorage.setItem("token", token);
    const me = await api.me();
    setUser(me);
    setLoading(false);
    return me;
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const { access_token } = await api.login(username, password);
      return applyToken(access_token);
    },
    [applyToken],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, applyToken, logout, refresh }),
    [user, loading, login, applyToken, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

export function isAdmin(user: User | null) {
  return user?.role === "admin" || user?.role === "superadmin";
}

/** Superadmin, or admin not linked to any venue (manages everything). */
export function isGlobalAdmin(user: User | null) {
  if (user?.role === "superadmin") return true;
  return user?.role === "admin" && user.venue_ids.length === 0;
}

export function isPlayer(user: User | null) {
  return user?.role === "player";
}
