import { describeSeedError, safeSeedUrl, seedProgress } from "../progress.js";
import {
  isTransfermarktProxyQuotaError,
  TransfermarktHttpError,
  TransfermarktThinResponseError,
  TransfermarktWafChallengeError,
} from "./transfermarkt-errors.js";

export const DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS = 1_500;
export const DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS = 6;
export const DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS = 2_000;
export const TRANSFERMARKT_RETRY_MAX_DELAY_MS = 60_000;
export const DEFAULT_TRANSFERMARKT_MAX_DELAY_MS = 15_000;

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

/**
 * `retryable` — Transfermarkt's own edge hiccups (nginx 502/504, timeouts) and the
 * WAF gate. Measured on Desktop: the same URL answers 502, 502, 502, timeout, 200.
 * `missing` — the page does not exist. `fatal` — anything a retry cannot fix.
 */
export type TransfermarktFailureClass = "retryable" | "missing" | "fatal";

const RETRYABLE_STATUSES = new Set([202, 408, 425, 429, 500, 502, 503, 504, 522, 524]);
const BLOCK_STATUSES = new Set([403, 429]);

const RETRYABLE_NETWORK_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

const RETRYABLE_ERROR_NAMES = new Set(["AbortError", "TimeoutError", "FetchError"]);

function errorCodes(error: unknown, depth = 0): string[] {
  if (!error || typeof error !== "object" || depth > 3) {
    return [];
  }
  const codes: string[] = [];
  if ("code" in error && typeof error.code === "string") {
    codes.push(error.code);
  }
  if ("cause" in error) {
    codes.push(...errorCodes(error.cause, depth + 1));
  }
  return codes;
}

export function classifyTransfermarktFailure(error: unknown): TransfermarktFailureClass {
  // Before every other rule: a spent plan answers the same way on attempt six as on one.
  if (isTransfermarktProxyQuotaError(error)) {
    return "fatal";
  }

  if (
    error instanceof TransfermarktWafChallengeError ||
    error instanceof TransfermarktThinResponseError
  ) {
    return "retryable";
  }

  if (error instanceof TransfermarktHttpError) {
    if (error.status === 404 || error.status === 410) {
      return "missing";
    }
    if (BLOCK_STATUSES.has(error.status) || RETRYABLE_STATUSES.has(error.status)) {
      return "retryable";
    }
    return "fatal";
  }

  if (error instanceof Error && RETRYABLE_ERROR_NAMES.has(error.name)) {
    return "retryable";
  }

  if (errorCodes(error).some((code) => RETRYABLE_NETWORK_CODES.has(code))) {
    return "retryable";
  }

  return "fatal";
}

/** A block is the WAF or a rate limit — not a transient upstream error. */
export function isTransfermarktBlock(error: unknown): boolean {
  if (error instanceof TransfermarktWafChallengeError) {
    return true;
  }
  return error instanceof TransfermarktHttpError && BLOCK_STATUSES.has(error.status);
}

function backoffDelayMs(attempt: number, baseDelayMs: number, random: TransfermarktRandom): number {
  const exponential = Math.min(TRANSFERMARKT_RETRY_MAX_DELAY_MS, baseDelayMs * 2 ** attempt);
  const jitterFactor = 0.5 + random() * 0.5;
  return Math.floor(exponential * jitterFactor);
}

export interface TransfermarktRequestDelayOptions {
  delayMs: number;
  sleep?: TransfermarktSleep;
  clock?: TransfermarktClock;
}

export function createTransfermarktRequestDelay<T>(
  innerFetch: (url: string) => Promise<T>,
  options: TransfermarktRequestDelayOptions,
): (url: string) => Promise<T> {
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

    seedProgress(`GET ${safeSeedUrl(url)}`);
    try {
      return await innerFetch(url);
    } finally {
      lastFetchFinishedAt = clock.now();
    }
  };
}

/**
 * Pacing shared by every Transfermarkt GET in one run — HTML and portrait bytes alike,
 * so images do not burst past the throttle the HTML fetch just backed off to.
 */
export interface TransfermarktThrottleState {
  baseDelayMs: number;
  maxDelayMs: number;
  currentDelayMs: number;
  lastFetchFinishedAt?: number;
}

export function createTransfermarktThrottleState(
  baseDelayMs: number,
  maxDelayMs: number = DEFAULT_TRANSFERMARKT_MAX_DELAY_MS,
): TransfermarktThrottleState {
  return {
    baseDelayMs,
    maxDelayMs: Math.max(baseDelayMs, maxDelayMs),
    currentDelayMs: baseDelayMs,
  };
}

export interface AdaptiveTransfermarktDelayOptions {
  state: TransfermarktThrottleState;
  growthFactor?: number;
  decayFactor?: number;
  sleep?: TransfermarktSleep;
  clock?: TransfermarktClock;
}

export function createAdaptiveTransfermarktDelay<T>(
  innerFetch: (url: string) => Promise<T>,
  options: AdaptiveTransfermarktDelayOptions,
): (url: string) => Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const clock = options.clock ?? defaultClock;
  const growthFactor = options.growthFactor ?? 1.5;
  const decayFactor = options.decayFactor ?? 0.9;
  const state = options.state;

  return async (url: string) => {
    if (state.lastFetchFinishedAt !== undefined && state.currentDelayMs > 0) {
      const waitMs = state.currentDelayMs - (clock.now() - state.lastFetchFinishedAt);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    seedProgress(`GET ${safeSeedUrl(url)}`);
    try {
      const result = await innerFetch(url);
      state.currentDelayMs = Math.max(
        state.baseDelayMs,
        Math.floor(state.currentDelayMs * decayFactor),
      );
      return result;
    } catch (error: unknown) {
      if (classifyTransfermarktFailure(error) === "retryable") {
        const raised = Math.min(
          state.maxDelayMs,
          Math.ceil(Math.max(state.currentDelayMs, 1) * growthFactor),
        );
        if (raised !== state.currentDelayMs) {
          state.currentDelayMs = raised;
          seedProgress(`throttle delay=${state.currentDelayMs}ms`);
        }
      }
      throw error;
    } finally {
      state.lastFetchFinishedAt = clock.now();
    }
  };
}

export interface TransfermarktRetryFetchOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: TransfermarktSleep;
  random?: TransfermarktRandom;
}

export function createTransfermarktRetryFetch<T>(
  innerFetch: (url: string) => Promise<T>,
  options: TransfermarktRetryFetchOptions = {},
): (url: string) => Promise<T> {
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
        if (classifyTransfermarktFailure(error) !== "retryable") {
          seedProgress(`fail ${describeSeedError(error)}`);
          throw error;
        }

        const isLastAttempt = attempt >= maxAttempts - 1;
        if (isLastAttempt) {
          seedProgress(`fail ${describeSeedError(error)} (retries exhausted)`);
          throw error;
        }

        seedProgress(
          `retry ${describeSeedError(error)} attempt ${attempt + 2}/${maxAttempts} ${safeSeedUrl(url)}`,
        );
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
