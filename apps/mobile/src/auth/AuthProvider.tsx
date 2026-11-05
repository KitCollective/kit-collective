import type {
  Entitlement,
  IdentityLinkedProvider,
  IdentityMe,
  IdentitySession,
  Offer,
} from "@kit/api-contract";
import { OFFER_PRODUCT_IDS } from "@kit/domain";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchBillingOffer, startNestTrial } from "@/api/billing";
import {
  fetchCookieConsent,
  fetchCurrentUser,
  fetchPrefs,
  loginSocial,
  verifySignInCode,
} from "@/api/identity";
import { requestNativeIdToken } from "@/auth/native-id-token";
import { clearSession, loadSession, saveSession } from "@/auth/session";
import { PaywallSheet } from "@/components/paywall-sheet";
import { loadAnalysisIfConsented } from "@/consent/analysis-loader";
import {
  loadPaywallOfferState,
  type PaywallOfferState,
  purchasePaywallProduct,
  restorePaywallPurchases,
} from "@/premium/paywall-offer";
import {
  type PlusAccessState,
  resolvePaywallBody,
  resolvePlusAccessState,
  type TrialTerms,
} from "@/premium/plus-view-model";
import { startTrialFromPaywall } from "@/premium/start-trial";
import { resetAddSession } from "@/session/addSession";
import { useAppearanceOptional } from "@/theme/appearance";

type AuthContextValue = {
  user: IdentityMe | null;
  accessToken: string | null;
  entitlement: Entitlement | null;
  isLoading: boolean;
  signInSocial: (provider: IdentityLinkedProvider) => Promise<void>;
  /** Signs in (or registers) with the six-digit code mailed to the address. */
  signInWithCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** `true` only when the Collector already has Plus. Otherwise it opens the paywall Sheet and never starts a trial. */
  requestPremiumAccess: () => Promise<boolean>;
  closePaywall: () => void;
  plus: {
    accessState: PlusAccessState;
    offer: TrialTerms | null;
    /** The monthly store price, `null` until the store answers. */
    monthPrice: string | null;
    /** Loads Offer and the store prices, for a screen that shows them before any tap. */
    loadTerms: () => void;
    openPaywall: () => Promise<void>;
  };
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
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallBusy, setPaywallBusy] = useState(false);
  const [paywallOffer, setPaywallOffer] = useState<PaywallOfferState>({
    iapAvailable: false,
    webUnavailableMessage: null,
    monthPrice: null,
    yearPrice: null,
  });
  const [paywallError, setPaywallError] = useState<string | null>(null);
  const [billingOffer, setBillingOffer] = useState<Offer | null>(null);
  const offerRequest = useRef<Promise<Offer | null> | null>(null);
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

  const signInSocial = useCallback(
    async (provider: IdentityLinkedProvider) => {
      const idToken = await requestNativeIdToken(provider);
      const next = await loginSocial(provider, idToken);
      await applySession(next);
    },
    [applySession],
  );

  const signInWithCode = useCallback(
    async (email: string, code: string) => {
      const next = await verifySignInCode(email, code);
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

  const accessToken = session?.accessToken ?? null;

  const closePaywall = useCallback(() => {
    setPaywallOpen(false);
    setPaywallError(null);
  }, []);

  // A new session starts without the last Collector's Offer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the token is the trigger, not a value read.
  useEffect(() => {
    offerRequest.current = null;
    setBillingOffer(null);
  }, [accessToken]);

  const loadBillingOffer = useCallback((): Promise<Offer | null> => {
    if (!accessToken) {
      return Promise.resolve(null);
    }
    offerRequest.current ??= fetchBillingOffer(accessToken)
      .then((loaded) => {
        setBillingOffer(loaded);
        return loaded;
      })
      .catch(() => {
        // Without Offer the trial counts as used; the next ask tries again.
        offerRequest.current = null;
        return null;
      });
    return offerRequest.current;
  }, [accessToken]);

  const loadStorePrices = useCallback(async () => {
    try {
      setPaywallOffer(await loadPaywallOfferState());
    } catch {
      setPaywallOffer({
        iapAvailable: false,
        webUnavailableMessage: null,
        monthPrice: null,
        yearPrice: null,
      });
    }
  }, []);

  const loadTerms = useCallback(() => {
    void loadBillingOffer();
    void loadStorePrices();
  }, [loadBillingOffer, loadStorePrices]);

  /** Offer decides the body (trial or buy), so it is read before the Sheet shows. Prices follow. */
  const openPaywall = useCallback(async () => {
    await loadBillingOffer();
    setPaywallOpen(true);
    await loadStorePrices();
  }, [loadBillingOffer, loadStorePrices]);

  const refreshEntitlementAfterPurchase = useCallback(async () => {
    if (!session) {
      return;
    }

    const profile = await fetchCurrentUser(session.accessToken);
    setUser(profile);
    if (profile.entitlement.live) {
      setPaywallOpen(false);
    }
  }, [session]);

  const handleBuyMonth = useCallback(async () => {
    if (!session) {
      return;
    }

    setPaywallBusy(true);
    try {
      await purchasePaywallProduct(session.accessToken, OFFER_PRODUCT_IDS.month);
      await refreshEntitlementAfterPurchase();
    } finally {
      setPaywallBusy(false);
    }
  }, [session, refreshEntitlementAfterPurchase]);

  const handleBuyYear = useCallback(async () => {
    if (!session) {
      return;
    }

    setPaywallBusy(true);
    try {
      await purchasePaywallProduct(session.accessToken, OFFER_PRODUCT_IDS.year);
      await refreshEntitlementAfterPurchase();
    } finally {
      setPaywallBusy(false);
    }
  }, [session, refreshEntitlementAfterPurchase]);

  const handleRestorePurchases = useCallback(async () => {
    if (!session) {
      return;
    }

    setPaywallBusy(true);
    try {
      await restorePaywallPurchases(session.accessToken);
      await refreshEntitlementAfterPurchase();
    } finally {
      setPaywallBusy(false);
    }
  }, [session, refreshEntitlementAfterPurchase]);

  const handleStartTrial = useCallback(async () => {
    if (!session) {
      return;
    }

    setPaywallBusy(true);
    setPaywallError(null);
    const result = await startTrialFromPaywall({
      startTrial: () => startNestTrial(session.accessToken),
      refreshProfile: () => fetchCurrentUser(session.accessToken),
    });
    setPaywallBusy(false);

    if (result.status === "started") {
      setUser(result.profile);
      setPaywallOpen(false);
      return;
    }
    setPaywallError(result.message);
  }, [session]);

  const accessState: PlusAccessState = user
    ? resolvePlusAccessState(user.entitlement, billingOffer)
    : "none-trial-used";

  const requestPremiumAccess = useCallback(async (): Promise<boolean> => {
    if (accessState === "live") {
      return true;
    }

    await openPaywall();
    return false;
  }, [accessState, openPaywall]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken: session?.accessToken ?? null,
      entitlement: user?.entitlement ?? null,
      isLoading,
      signInSocial,
      signInWithCode,
      signOut,
      refreshUser,
      requestPremiumAccess,
      closePaywall,
      plus: {
        accessState,
        offer: billingOffer,
        monthPrice: paywallOffer.monthPrice,
        loadTerms,
        openPaywall,
      },
    }),
    [
      user,
      session,
      isLoading,
      signInSocial,
      signInWithCode,
      signOut,
      refreshUser,
      requestPremiumAccess,
      closePaywall,
      accessState,
      billingOffer,
      paywallOffer.monthPrice,
      loadTerms,
      openPaywall,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <PaywallSheet
        visible={paywallOpen}
        onDismiss={closePaywall}
        iapAvailable={paywallOffer.iapAvailable}
        webUnavailableMessage={paywallOffer.webUnavailableMessage}
        monthPrice={paywallOffer.monthPrice}
        yearPrice={paywallOffer.yearPrice}
        body={resolvePaywallBody(accessState, billingOffer, paywallOffer.monthPrice)}
        error={paywallError}
        onStartTrial={() => {
          void handleStartTrial();
        }}
        onBuyMonth={() => {
          void handleBuyMonth();
        }}
        onBuyYear={() => {
          void handleBuyYear();
        }}
        onRestore={() => {
          void handleRestorePurchases();
        }}
        busy={paywallBusy}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
