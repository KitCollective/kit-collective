import {
  type IdentityMe,
  type IdentitySession,
  identityMeSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "../api/client.js";

const STORAGE_KEY = "kit.admin.session";

type AuthState = {
  token: string;
  user: IdentityMe;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStoredSession(raw: string): AuthState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  if (typeof parsed.token !== "string" || parsed.token.length === 0) {
    return null;
  }

  const userResult = identityMeSchema.safeParse(parsed.user);
  if (!userResult.success) {
    return null;
  }

  return { token: parsed.token, user: userResult.data };
}

type AuthContextValue = {
  token: string | null;
  user: IdentityMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): AuthState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return parseStoredSession(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setLoading(false);
      return;
    }

    apiFetch<IdentityMe>("/identity/me", { token: stored.token })
      .then((user) => {
        const parsed = identityMeSchema.parse(user);
        if (parsed.role !== "admin") {
          sessionStorage.removeItem(STORAGE_KEY);
          setSession(null);
          return;
        }
        setSession({ token: stored.token, user: parsed });
      })
      .catch(() => {
        sessionStorage.removeItem(STORAGE_KEY);
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const body = await apiFetch<IdentitySession>("/identity/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const sessionBody = identitySessionSchema.parse(body);
    if (sessionBody.user.role !== "admin") {
      throw new Error("Staff access required");
    }
    const next = { token: sessionBody.accessToken, user: sessionBody.user };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      loading,
      login,
      logout,
    }),
    [session, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
