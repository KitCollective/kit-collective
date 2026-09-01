import {
  collectionBlockPeerResponseSchema,
  collectionReportPeerRequestSchema,
  collectionReportPeerResponseSchema,
} from "@kit/api-contract";
import { getApiBaseUrl } from "./config";

async function requestJson(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
}

export class ModerationFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ModerationFetchError";
  }
}

export async function reportPeer(
  accessToken: string,
  peerId: string,
  body: { reason?: string },
): Promise<void> {
  const payload = collectionReportPeerRequestSchema.parse(body);
  const response = await requestJson(`/v1/moderation/peers/${peerId}/report`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ModerationFetchError("Kunne ikke rapportere", response.status);
  }

  collectionReportPeerResponseSchema.parse(await response.json());
}

export async function blockPeer(accessToken: string, peerId: string): Promise<void> {
  const response = await requestJson(`/v1/moderation/peers/${peerId}/block`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new ModerationFetchError("Kunne ikke blokere", response.status);
  }

  collectionBlockPeerResponseSchema.parse(await response.json());
}
