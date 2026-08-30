import type { IdentityMe, IdentitySession } from "@kit/api-contract";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchCookieConsent,
  fetchCurrentUser,
  fetchPrefs,
  loginCollector,
  registerCollector,
} from "@/api/identity";
import { clearSession, loadSession, saveSession } from "@/auth/session";
import { loadAnalysisIfConsented } from "@/consent/analysis-loader";
import { resetAddSession } from "@/session/addSession";
import { useAppearanceOptional } from "@/theme/appearance";

type AuthContextValue = {
  user: IdentityMe | null;
  accessToken: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function hydrateUser(session: IdentitySession): Promise<IdentityMe> {
  return fetchCurrentUser(session.accessToken);
}

async function hydrateConsent(accessToken: string): Promise<void> {
  try {
    const consent = await fetchCookieConsent(accessToken);
    loadAnalysisIfConsented(consent);
  } catch {
    loadAnalysisIfConsented(null);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<IdentitySession | null>(null);
  const [user, setUser] = useState<IdentityMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appearance = useAppearanceOptional();

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
        const profile = await hydrateUser(stored);
        if (active) {
          setSession(stored);
          setUser(profile);
        }
        await hydrateConsent(stored.accessToken);
        if (appearance) {
          const prefs = await fetchPrefs(stored.accessToken);
          if (active) {
            appearance.setAppearance(prefs.appearance);
          }
        }
      } catch {
        await clearSession();
        if (active) {
          setSession(null);
          setUser(null);
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
  }, [appearance]);

  const applySession = useCallback(
    async (next: IdentitySession) => {
      const profile = await hydrateUser(next);
      await saveSession(next);
      setSession(next);
      setUser(profile);
      await hydrateConsent(next.accessToken);
      if (appearance) {
        const prefs = await fetchPrefs(next.accessToken);
        appearance.setAppearance(prefs.appearance);
      }
    },
    [appearance],
  );

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
    resetAddSession();
    setSession(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session) {
      return;
    }

    const profile = await fetchCurrentUser(session.accessToken);
    setUser(profile);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken: session?.accessToken ?? null,
      isLoading,
      signIn,
      signUp,
      signOut,
      refreshUser,
    }),
    [user, session, isLoading, signIn, signUp, signOut, refreshUser],
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
