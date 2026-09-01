import {
  type CollectionBiddingPatch,
  type CollectionDiscoverJerseys,
  type CollectionJersey,
  type CollectionPeerJersey,
  type CollectionPrivatePatch,
  type CollectionRespondBidResponse,
  type CollectionSendBidRequest,
  type CollectionSendBidResponse,
  collectionDiscoverJerseysSchema,
  collectionJerseySchema,
  collectionPeerJerseySchema,
  collectionRespondBidResponseSchema,
  collectionSendBidRequestSchema,
  collectionSendBidResponseSchema,
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

export class BiddingFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BiddingFetchError";
  }
}

export async function fetchDiscoverJerseys(
  accessToken: string,
  query?: string,
): Promise<CollectionDiscoverJerseys> {
  const search = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const response = await requestJson(`/v1/collection/discover/jerseys${search}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new BiddingFetchError("Kunne ikke søge efter trøjer", response.status);
  }

  return collectionDiscoverJerseysSchema.parse(await response.json());
}

export async function fetchPeerJersey(
  accessToken: string,
  jerseyId: string,
): Promise<CollectionPeerJersey> {
  const response = await requestJson(`/v1/collection/jerseys/${jerseyId}/peer`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new BiddingFetchError("Kunne ikke hente trøjen", response.status);
  }

  return collectionPeerJerseySchema.parse(await response.json());
}

export async function patchJerseyBidding(
  accessToken: string,
  jerseyId: string,
  payload: CollectionBiddingPatch,
): Promise<CollectionJersey> {
  const response = await requestJson(`/v1/collection/jerseys/${jerseyId}/bidding`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new BiddingFetchError("Kunne ikke opdatere bud-indstilling", response.status);
  }

  // SAFETY: the /v1 collection PATCH returns an envelope { jersey: CollectionJersey };
  // collectionJerseySchema.parse validates the payload at this seam.
  const body = (await response.json()) as { jersey: CollectionJersey };
  return collectionJerseySchema.parse(body.jersey);
}

export async function patchJerseyPrivate(
  accessToken: string,
  jerseyId: string,
  payload: CollectionPrivatePatch,
): Promise<CollectionJersey> {
  const response = await requestJson(`/v1/collection/jerseys/${jerseyId}/private`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new BiddingFetchError("Kunne ikke opdatere privathed", response.status);
  }

  // SAFETY: the /v1 collection PATCH returns an envelope { jersey: CollectionJersey };
  // collectionJerseySchema.parse validates the payload at this seam.
  const body = (await response.json()) as { jersey: CollectionJersey };
  return collectionJerseySchema.parse(body.jersey);
}

export async function sendBid(
  accessToken: string,
  jerseyId: string,
  payload: CollectionSendBidRequest,
): Promise<CollectionSendBidResponse> {
  const body = collectionSendBidRequestSchema.parse(payload);
  const response = await requestJson(`/v1/collection/jerseys/${jerseyId}/bids`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new BiddingFetchError("Kunne ikke sende bud", response.status);
  }

  return collectionSendBidResponseSchema.parse(await response.json());
}

export async function respondBid(
  accessToken: string,
  conversationId: string,
  messageId: string,
  decision: "accept" | "decline",
): Promise<CollectionRespondBidResponse> {
  const response = await requestJson(
    `/v1/collection/conversations/${conversationId}/messages/${messageId}/bid`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ decision }),
    },
  );

  if (!response.ok) {
    throw new BiddingFetchError("Kunne ikke opdatere bud", response.status);
  }

  return collectionRespondBidResponseSchema.parse(await response.json());
}
