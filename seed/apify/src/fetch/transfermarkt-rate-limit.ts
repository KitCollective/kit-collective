import { TransfermarktHttpError } from "./kader-fetch-adapter.js";

export const DEFAULT_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER = 3;

export class TransfermarktCircuitOpenError extends Error {
  constructor() {
    super("Transfermarkt fetch stopped after consecutive HTTP 403/429 responses");
    this.name = "TransfermarktCircuitOpenError";
  }
}

export interface TransfermarktRateLimitGuard {
  fetchHtml: (url: string) => Promise<string>;
  isOpen: () => boolean;
  consecutiveRateLimitErrors: () => number;
}

function isRateLimitStatus(status: number): boolean {
  return status === 403 || status === 429;
}

export function createTransfermarktRateLimitGuard(
  innerFetch: (url: string) => Promise<string>,
  options: { stopAfter?: number } = {},
): TransfermarktRateLimitGuard {
  const stopAfter = options.stopAfter ?? DEFAULT_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER;
  let consecutive = 0;
  let open = false;

  const fetchHtml = async (url: string): Promise<string> => {
    if (open) {
      throw new TransfermarktCircuitOpenError();
    }

    try {
      const html = await innerFetch(url);
      consecutive = 0;
      return html;
    } catch (error: unknown) {
      if (error instanceof TransfermarktHttpError && isRateLimitStatus(error.status)) {
        consecutive += 1;
        if (consecutive >= stopAfter) {
          open = true;
        }
      }
      throw error;
    }
  };

  return {
    fetchHtml,
    isOpen: () => open,
    consecutiveRateLimitErrors: () => consecutive,
  };
}
