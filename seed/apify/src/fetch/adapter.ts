import type { TransfermarktRawPayload } from "../types.js";

export interface FetchParams {
  competition: string;
  fromSeason: string;
  toSeason: string;
}

export interface FetchAdapter {
  fetch(params: FetchParams): Promise<TransfermarktRawPayload>;
}
