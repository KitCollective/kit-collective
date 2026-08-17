import { readFile } from "node:fs/promises";
import type { FetchAdapter, FetchParams } from "./adapter.js";
import type { TransfermarktRawPayload } from "../types.js";

export function createFixtureFetchAdapter(fixturePath: string): FetchAdapter {
  let cached: TransfermarktRawPayload | undefined;

  return {
    async fetch(_params: FetchParams): Promise<TransfermarktRawPayload> {
      if (!cached) {
        const raw = await readFile(fixturePath, "utf8");
        cached = JSON.parse(raw) as TransfermarktRawPayload;
      }
      return cached;
    },
  };
}
