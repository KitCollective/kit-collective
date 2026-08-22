import { TransfermarktHttpError } from "./kader-fetch-adapter.js";

export const DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS = 1_500;
export const DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS = 1_000;

export type TransfermarktSleep = (ms: number) => Promise<void>;

export interface TransfermarktClock {
  now(): number;
}

export type TransfermarktRandom = () => number;

export const defaultSleep: TransfermarktSleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const defaultClock: TransfermarktClock = {
  now: () => Date.now(),
};

function isRateLimitStatus(status: number): boolean {
  return status === 403 || status === 429;
}

function backoffDelayMs(attempt: number, baseDelayMs: number, random: TransfermarktRandom): number {
  const exponential = baseDelayMs * 2 ** attempt;
  const jitterFactor = 0.5 + random() * 0.5;
  return Math.floor(exponential * jitterFactor);
}

export interface TransfermarktRequestDelayOptions {
  delayMs: number;
  sleep?: TransfermarktSleep;
  clock?: TransfermarktClock;
}

export function createTransfermarktRequestDelay(
  innerFetch: (url: string) => Promise<string>,
  options: TransfermarktRequestDelayOptions,
): (url: string) => Promise<string> {
  const sleep = options.sleep ?? defaultSleep;
  const clock = options.clock ?? defaultClock;
  let lastFetchFinishedAt: number | undefined;

  return async (url: string) => {
    if (lastFetchFinishedAt !== undefined && options.delayMs > 0) {
      const elapsed = clock.now() - lastFetchFinishedAt;
      const waitMs = options.delayMs - elapsed;
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    try {
      return await innerFetch(url);
    } finally {
      lastFetchFinishedAt = clock.now();
    }
  };
}

export interface TransfermarktRetryFetchOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: TransfermarktSleep;
  random?: TransfermarktRandom;
}

export function createTransfermarktRetryFetch(
  innerFetch: (url: string) => Promise<string>,
  options: TransfermarktRetryFetchOptions = {},
): (url: string) => Promise<string> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  return async (url: string) => {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await innerFetch(url);
      } catch (error: unknown) {
        lastError = error;
        if (!(error instanceof TransfermarktHttpError && isRateLimitStatus(error.status))) {
          throw error;
        }

        const isLastAttempt = attempt >= maxAttempts - 1;
        if (isLastAttempt) {
          throw error;
        }

        await sleep(backoffDelayMs(attempt, baseDelayMs, random));
      }
    }

    throw lastError;
  };
}

export function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}
