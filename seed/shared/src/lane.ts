export const SEED_LANES = ["development", "staging", "production"] as const;

export type SeedLane = (typeof SEED_LANES)[number];

export type ResolvedSeedLane = Exclude<SeedLane, "production">;

export type ResolveLaneResult = { ok: true; lane: ResolvedSeedLane } | { ok: false; error: string };

/**
 * Default lane is development. Staging only when explicitly named.
 * Production is always rejected for seed tools and CLIs.
 */
export function resolveSeedLane(input?: string | null): ResolveLaneResult {
  const trimmed = input?.trim();
  const normalized = trimmed ? trimmed.toLowerCase() : "development";

  if (normalized === "production") {
    return {
      ok: false,
      error:
        "Lane 'production' is rejected. Seed ingest only supports development (default) or staging when explicitly named.",
    };
  }

  if (normalized === "development" || normalized === "staging") {
    return { ok: true, lane: normalized };
  }

  return {
    ok: false,
    error: `Unknown lane '${input}'. Use development (default) or staging.`,
  };
}

export function laneDatabaseEnvVar(lane: ResolvedSeedLane): string {
  switch (lane) {
    case "development":
      return "DATABASE_URL";
    case "staging":
      return "SEED_STAGING_DATABASE_URL";
    default: {
      const _exhaustive: never = lane;
      return _exhaustive;
    }
  }
}
