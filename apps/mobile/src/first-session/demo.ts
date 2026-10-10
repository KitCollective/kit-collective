import type { KitType } from "@kit/domain";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { BRAND_MOMENTS, REDUCED_TRAVEL_MS } from "@/first-session/brand-moments";
import type { DemoExampleId } from "@/first-session/session";

export type DemoRowKey = "club" | "season" | "type";

export const DEMO_ROW_KEYS: readonly DemoRowKey[] = ["club", "season", "type"];

export type ExampleJersey = {
  id: DemoExampleId;
  clubLabel: string;
  seasonLabel: string;
  type: KitType;
};

/**
 * The fixed result the demo plays. The demo never calls Vision or the API:
 * these labels are the whole answer. Clubs are fictional placeholders until
 * Nicklas supplies KitCollective's own photos.
 */
export const EXAMPLE_JERSEYS: readonly ExampleJersey[] = [
  { id: "example-1", clubLabel: "Pladsholder FC", seasonLabel: "2023/24", type: "home" },
  { id: "example-2", clubLabel: "Eksempel IF", seasonLabel: "2021/22", type: "away" },
  { id: "example-3", clubLabel: "Prøve BK", seasonLabel: "2019/20", type: "third" },
];

export function exampleById(id: DemoExampleId): ExampleJersey {
  const found = EXAMPLE_JERSEYS.find((jersey) => jersey.id === id);
  if (!found) {
    throw new Error(`Unknown demo example: ${id}`);
  }
  return found;
}

export function demoRowValue(jersey: ExampleJersey, row: DemoRowKey): string {
  switch (row) {
    case "club":
      return jersey.clubLabel;
    case "season":
      return jersey.seasonLabel;
    case "type":
      return KIT_TYPE_LABELS_DA[jersey.type];
  }
}

/**
 * Measured Vision time in whole seconds, from real runs on the eval set.
 * `null` until measured: the counter stays hidden (design lock: a shown time
 * must be measured, never chosen).
 */
export const DEMO_MEASURED_SECONDS: number | null = null;

export function demoSecondsLabel(measuredSeconds: number | null): string | null {
  if (measuredSeconds === null || !Number.isFinite(measuredSeconds) || measuredSeconds <= 0) {
    return null;
  }
  return `Læst på ${measuredSeconds} sek.`;
}

/** Gap between one row resolving and the next. Not in the lock: flagged, provisional. */
export const DEMO_ROW_STEP_MS = 400;

export type DemoTimeline = {
  /** "fly": scaled transform from the tray. "crossfade": Reduce Motion. */
  travel: "fly" | "crossfade";
  travelMs: number;
  showsScanLine: boolean;
  /** Start of each row's reveal, in ms from the tap, in resolve order. */
  rowAtMs: readonly [number, number, number];
  rowRevealMs: number;
  /** When the result (example marker and actions) is complete. */
  resultAtMs: number;
};

export function demoTimeline(reduceMotion: boolean): DemoTimeline {
  const { scanPassMs, rowRevealMs } = BRAND_MOMENTS.visionAtWork;
  const travelMs = reduceMotion ? REDUCED_TRAVEL_MS : BRAND_MOMENTS.jerseyToStage.travelMs;
  // With the scan line the first row resolves when the first pass ends.
  const firstRowAt = travelMs + (reduceMotion ? DEMO_ROW_STEP_MS : scanPassMs);
  const rowAtMs: [number, number, number] = [
    firstRowAt,
    firstRowAt + DEMO_ROW_STEP_MS,
    firstRowAt + DEMO_ROW_STEP_MS * 2,
  ];
  return {
    travel: reduceMotion ? "crossfade" : "fly",
    travelMs,
    showsScanLine: !reduceMotion,
    rowAtMs,
    rowRevealMs,
    resultAtMs: rowAtMs[2] + rowRevealMs,
  };
}

/** Rows resolved `elapsedMs` after the tap, one at a time. */
export function demoResolvedRows(timeline: DemoTimeline, elapsedMs: number): DemoRowKey[] {
  return DEMO_ROW_KEYS.filter((_, index) => elapsedMs >= (timeline.rowAtMs[index] ?? Infinity));
}
