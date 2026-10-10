import type { VisionJobResponse } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { BRAND_MOMENTS } from "@/first-session/brand-moments";
import { DEMO_ROW_KEYS, DEMO_ROW_STEP_MS, type DemoRowKey } from "@/first-session/demo";

/** The rows Vision found, keyed like the demo rows. A row Vision did not find is absent. */
export type VisionRows = Partial<Record<DemoRowKey, string>>;

export type VisionOutcome =
  | { kind: "pending" }
  | { kind: "ready"; rows: VisionRows }
  | { kind: "failed" };

/**
 * Reads one Vision job answer. A finished job with no club, season or type is a
 * failure: there is nothing to show, so the collector gets the failure screen.
 */
export function classifyVisionJob(job: VisionJobResponse): VisionOutcome {
  if (job.status === "pending") {
    return { kind: "pending" };
  }
  if (job.status !== "ready" || !job.suggestions) {
    return { kind: "failed" };
  }

  const { clubLabel, nationalTeamLabel, seasonLabel, type } = job.suggestions;
  const rows: VisionRows = {};
  const club = clubLabel ?? nationalTeamLabel;
  if (club) {
    rows.club = club;
  }
  if (seasonLabel) {
    rows.season = seasonLabel;
  }
  if (type) {
    rows.type = KIT_TYPE_LABELS_DA[type];
  }
  return Object.keys(rows).length === 0 ? { kind: "failed" } : { kind: "ready", rows };
}

export type VisionReveal = {
  /** ms after the answer arrives at which each found row resolves. */
  rowAtMs: Partial<Record<DemoRowKey, number>>;
  /** ms after the answer arrives when the last row has finished revealing. */
  doneAtMs: number;
};

/** Found rows resolve one at a time, in demo order, at the same step as the demo. */
export function visionReveal(rows: VisionRows): VisionReveal {
  const rowAtMs: Partial<Record<DemoRowKey, number>> = {};
  let step = 0;
  for (const key of DEMO_ROW_KEYS) {
    if (rows[key] !== undefined) {
      rowAtMs[key] = step * DEMO_ROW_STEP_MS;
      step += 1;
    }
  }
  const lastAt = Math.max(0, (step - 1) * DEMO_ROW_STEP_MS);
  return { rowAtMs, doneAtMs: lastAt + BRAND_MOMENTS.visionAtWork.rowRevealMs };
}

/** Rows resolved `elapsedMs` after the answer arrived. */
export function visionResolvedRows(reveal: VisionReveal, elapsedMs: number): DemoRowKey[] {
  return DEMO_ROW_KEYS.filter((key) => {
    const at = reveal.rowAtMs[key];
    return at !== undefined && elapsedMs >= at;
  });
}

/** Up to three photos become one jersey on the own-photo road. */
export const FIRST_SESSION_PHOTO_CAP = 3;

export function capFirstSessionPhotos<T>(items: readonly T[]): T[] {
  return items.slice(0, FIRST_SESSION_PHOTO_CAP);
}
