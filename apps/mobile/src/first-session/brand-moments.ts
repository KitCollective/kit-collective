import { motion } from "@/theme/tokens";

/**
 * Durations for the three first-session brand moments.
 * Source: docs/design-system.md -> Motion -> Brand moments. Provisional until
 * Nicklas approves the tempo. `tokens.ts` has no tokens for these (flagged gap),
 * so they live here and nowhere else.
 */
export const BRAND_MOMENTS = {
  wall: {
    /** One drift duration per column, linear, inside the 22-32s band. */
    columnDriftMs: [22000, 27000, 32000],
    tiltDeg: 6,
    riseMs: 520,
    riseStaggerMs: 90,
  },
  jerseyToStage: {
    travelMs: 420,
  },
  visionAtWork: {
    scanPassMs: 900,
    rowRevealMs: 260,
  },
} as const;

/** Reduce Motion: the tile cross-fades into the stage in the base duration. */
export const REDUCED_TRAVEL_MS = motion.base;
