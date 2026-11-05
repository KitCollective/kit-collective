import type { Entitlement, Offer } from "@kit/api-contract";
import { entitlementGateIsOff } from "@/premium/premium-access";

/** What the app needs from Offer to talk about the trial. */
export type TrialTerms = Pick<Offer, "trialEnabled" | "trialDays">;

export type PlusAccessState = "none-trial-available" | "none-trial-used" | "live" | "lapsed";

export type WishlistPage = "sell" | "list";

export type SellPage = {
  buttonLabel: string;
  /** The monthly store price, or `null` while it loads (the screen shows a skeleton). */
  caption: string | null;
};

export type PaywallBody =
  | {
      kind: "trial";
      timeline: Array<{ label: string; text: string }>;
      /** `null` while the store price loads (the Sheet shows a skeleton). */
      priceLine: string | null;
      buttonLabel: string;
    }
  | { kind: "buy" };

export const PAYWALL_BENEFITS = ["Besked ved match", "Ubegrænset fotogenkendelse"];

/** TODO(KIT-523 signal-up): no Vilkår or Privatliv URL is decided yet; the links stay inert until it is. */
export const PAYWALL_LEGAL_URLS: { terms: string | null; privacy: string | null } = {
  terms: null,
  privacy: null,
};

const START_TRIAL_LABEL = "Start gratis prøve";

function daysLabel(days: number): string {
  return days === 1 ? "1 dag" : `${days} dage`;
}

function trialIsOffered(offer: TrialTerms | null): offer is TrialTerms {
  return offer !== null && offer.trialEnabled && offer.trialDays > 0;
}

/**
 * Without Offer, or with the trial off in it, the trial counts as used, so the app never promises a
 * trial the server would refuse.
 */
export function resolvePlusAccessState(
  entitlement: Entitlement,
  offer: TrialTerms | null,
  gateFlag?: string,
  isDevBuild?: boolean,
): PlusAccessState {
  if (entitlementGateIsOff(gateFlag, isDevBuild)) {
    return "live";
  }

  if (entitlement.live) {
    return "live";
  }

  if (entitlement.source !== null || entitlement.trialUsed) {
    return "lapsed";
  }

  return trialIsOffered(offer) ? "none-trial-available" : "none-trial-used";
}

/** A lapsed Collector keeps their wishes, so only the two `none-*` states get the sell page. */
export function resolveWishlistPage(state: PlusAccessState): WishlistPage {
  return state === "none-trial-available" || state === "none-trial-used" ? "sell" : "list";
}

export function resolveSellPage(
  state: PlusAccessState,
  offer: TrialTerms | null,
  monthPrice: string | null,
): SellPage {
  const caption = monthPrice ? `${monthPrice}/md.` : null;
  if (state === "none-trial-available" && trialIsOffered(offer)) {
    return { buttonLabel: `Prøv gratis i ${daysLabel(offer.trialDays)}`, caption };
  }
  return { buttonLabel: "Fortsæt med Plus", caption };
}

export function resolvePaywallBody(
  state: PlusAccessState,
  offer: TrialTerms | null,
  monthPrice: string | null,
): PaywallBody {
  if (state !== "none-trial-available" || !trialIsOffered(offer)) {
    return { kind: "buy" };
  }

  const days = offer.trialDays;
  const timeline = [{ label: "I dag", text: `${daysLabel(days)} gratis` }];
  // The reminder is the day before the end. With a one-day trial that day is today.
  if (days > 1) {
    timeline.push({ label: `Dag ${days - 1}`, text: "Påmindelse" });
  }
  timeline.push({ label: `Dag ${days}`, text: "Prøven slutter" });

  return {
    kind: "trial",
    timeline,
    priceLine: monthPrice ? `Derefter ${monthPrice}/md. Intet trækkes automatisk.` : null,
    buttonLabel: START_TRIAL_LABEL,
  };
}
