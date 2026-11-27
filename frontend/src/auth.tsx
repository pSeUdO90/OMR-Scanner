import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from "./api";

export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  must_change_password?: boolean;
  permissions?: Record<string, string[]>;
};

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // A token the server no longer accepts has to clear the signed-in user too,
  // or the app keeps rendering a shell whose every request fails.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    setToken(getToken());
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
      refresh: async () => {
        const row = await api.get("/api/auth/me");
        setUser(row as AuthUser);
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
