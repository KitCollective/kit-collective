import type { Lane } from "./types.js";

const ALLOWED_LANES: readonly Lane[] = ["development", "staging"];

export function parseLane(lane: string): Lane {
  if (lane === "production") {
    throw new Error("Lane production is rejected for seed runs");
  }
  const allowed = ALLOWED_LANES.find((candidate) => candidate === lane);
  if (!allowed) {
    throw new Error(`Unknown lane: ${lane}. Expected development or staging`);
  }
  return allowed;
}

export function resolveDatabaseUrl(lane: Lane): string {
  if (lane === "staging") {
    const url = process.env.STAGING_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error("STAGING_DATABASE_URL or DATABASE_URL is required for staging lane");
    }
    return url;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for development lane");
  }
  return url;
}
