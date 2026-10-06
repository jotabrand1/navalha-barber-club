import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, send } from "./api";
import type { User } from "./types";
interface Registration {
  name: string;
  email: string;
  phone: string;
  password: string;
}
interface Auth {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (
    identifier: string,
    password: string,
    remember: boolean,
  ) => Promise<User>;
  register: (data: Registration) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: User }>("/auth/me");
      setUser(data.user);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setError(null);
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível conectar ao servidor.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const login = async (
    identifier: string,
    password: string,
    remember: boolean,
  ) => {
    const { user: next } = await api<{ user: User }>(
      "/auth/login",
      send("POST", { identifier, password, remember }),
    );
    setUser(next);
    return next;
  };
  const register = async (data: Registration) => {
    const { user: next } = await api<{ user: User }>(
      "/auth/register",
      send("POST", data),
    );
    setUser(next);
    return next;
  };
  const logout = async () => {
    await api("/auth/logout", send("POST"));
    setUser(null);
  };
  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, register, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider ausente");
  return auth;
}
