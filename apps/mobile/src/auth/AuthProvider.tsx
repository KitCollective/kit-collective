import type { IdentitySession, IdentityUser } from "@kit/api-contract";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchCurrentUser, loginCollector, registerCollector } from "@/api/identity";
import { clearSession, loadSession, saveSession } from "@/auth/session";

type AuthContextValue = {
  user: IdentityUser | null;
  accessToken: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<IdentitySession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const stored = await loadSession();
      if (!stored) {
        if (active) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const user = await fetchCurrentUser(stored.accessToken);
        if (active) {
          setSession({ ...stored, user });
        }
      } catch {
        await clearSession();
        if (active) {
          setSession(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const applySession = useCallback(async (next: IdentitySession) => {
    await saveSession(next);
    setSession(next);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const next = await loginCollector({ email, password });
      await applySession(next);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const next = await registerCollector({ email, password });
      await applySession(next);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      isLoading,
      signIn,
      signUp,
      signOut,
    }),
    [session, isLoading, signIn, signUp, signOut],
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
