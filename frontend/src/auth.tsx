import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api";

export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  permissions?: Record<string, string[]>;
};

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .get("/api/auth/me")
      .then((row) => setUser(row as AuthUser))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      login: async (username: string, password: string) => {
        const res = await api.post("/api/auth/login", { username, password });
        setToken(String(res.token || ""));
        setUser(res.user as AuthUser);
      },
      logout: async () => {
        try {
          await api.post("/api/auth/logout");
        } catch {
          /* ignore */
        }
        clearToken();
        setUser(null);
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
