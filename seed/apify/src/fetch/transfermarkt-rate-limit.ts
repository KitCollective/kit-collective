import { seedProgress } from "../progress.js";
import { isTransfermarktProxyQuotaError } from "./transfermarkt-errors.js";
import { isTransfermarktBlock } from "./transfermarkt-fetch-policy.js";

export const DEFAULT_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER = 8;

export class TransfermarktCircuitOpenError extends Error {
  constructor() {
    super("Transfermarkt fetch stopped after consecutive HTTP 403/429 responses");
    this.name = "TransfermarktCircuitOpenError";
  }
}

export interface TransfermarktRateLimitGuard<T = string> {
  fetchHtml: (url: string) => Promise<T>;
  isOpen: () => boolean;
  consecutiveRateLimitErrors: () => number;
}

/** Circuit state shared by the HTML and asset fetch paths of one run. */
export interface TransfermarktCircuitState {
  consecutive: number;
  open: boolean;
}

export function createTransfermarktCircuitState(): TransfermarktCircuitState {
  return { consecutive: 0, open: false };
}

export interface TransfermarktRateLimitGuardOptions {
  stopAfter?: number;
  state?: TransfermarktCircuitState;
}

export function createTransfermarktRateLimitGuard<T>(
  innerFetch: (url: string) => Promise<T>,
  options: TransfermarktRateLimitGuardOptions = {},
): TransfermarktRateLimitGuard<T> {
  const stopAfter = options.stopAfter ?? DEFAULT_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER;
  const state = options.state ?? createTransfermarktCircuitState();

  const fetchHtml = async (url: string): Promise<T> => {
    if (state.open) {
      throw new TransfermarktCircuitOpenError();
    }

    try {
      const result = await innerFetch(url);
      state.consecutive = 0;
      return result;
    } catch (error: unknown) {
      // A spent Site Unblocker plan will not recover inside this run: open on the first one
      // rather than paying `stopAfter` URLs to learn the same thing.
      if (isTransfermarktProxyQuotaError(error)) {
        state.consecutive = stopAfter;
        state.open = true;
        seedProgress("circuit open: Site Unblocker refused the request (quota or billing)");
        throw error;
      }

      // Transient upstream 5xx and timeouts are Transfermarkt hiccups, not a block.
      if (isTransfermarktBlock(error)) {
        state.consecutive += 1;
        seedProgress(`rate-limit consecutive=${state.consecutive}/${stopAfter}`);
        if (state.consecutive >= stopAfter) {
          state.open = true;
          seedProgress(
            "circuit open: Transfermarkt fetch stopped after consecutive blocked responses",
          );
        }
      }
      throw error;
    }
  };

  return {
    fetchHtml,
    isOpen: () => state.open,
    consecutiveRateLimitErrors: () => state.consecutive,
  };
}
