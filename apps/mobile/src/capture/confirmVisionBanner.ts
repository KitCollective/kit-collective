/**
 * AI Vision Analyzer banner state for the Confirm hub.
 *
 * Design lock: `docs/design-system.md` Pattern **Confirm and Save** (Vision suggestion
 * strip) + Banner primitive. The banner sits under the sandbox belt and above the
 * flex spacer / Data & Detaljer cards so it reads as "we analysed these photos".
 *
 * Save never waits on Vision (lock): this state only drives chrome — it must never
 * gate `saveEnabled` or the fade **Gem** dock.
 */
export type ConfirmVisionBannerState = "inactive" | "out-of-quota" | "analyzing" | "success";

export type ConfirmVisionBannerInput = {
  /** Vision entitlement present for this collector (token / feature available). */
  activated: boolean;
  /** Freemium quota exhausted (>5 uploads on the free tier). */
  outOfQuota: boolean;
  /** A Vision suggest job is in flight for the active jersey. */
  analyzing: boolean;
  /** Vision filled the Data fields for us (high-confidence pre-select applied). */
  succeeded: boolean;
};

/**
 * One banner state at a time (Banner lock: "One banner at a time").
 *
 * Priority: live work (`analyzing`) wins, then a completed fill (`success`), then the
 * two idle/blocked states. Idle default is `inactive` — the collector has not turned
 * the analyzer on yet.
 */
export function resolveConfirmVisionBannerState(
  input: ConfirmVisionBannerInput,
): ConfirmVisionBannerState {
  if (input.analyzing) {
    return "analyzing";
  }
  if (input.succeeded) {
    return "success";
  }
  if (!input.activated) {
    return "inactive";
  }
  if (input.outOfQuota) {
    return "out-of-quota";
  }
  return "inactive";
}

/**
 * Collector-facing copy (Danish-first per the lock). "AI Vision" stays as a product
 * term; the verb is Danish. Flagged in `docs/design-system.md` (Modes 2026-09-06) in
 * case the lock prefers a fully-Danish or fully-English product string.
 */
export const CONFIRM_VISION_BANNER_COPY: Record<ConfirmVisionBannerState, string> = {
  inactive: "AI Analyzer er ikke aktiveret",
  "out-of-quota": "AI Analyzer er ude af forbrug",
  analyzing: "AI Vision analyserer …",
  success: "AI Vision udfyldte trøjens data",
};
