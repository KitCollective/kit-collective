import {
  type CollectionBiddingPatch,
  type CollectionDiscoverJerseys,
  type CollectionPeerJersey,
  type CollectionSendBidRequest,
  type CollectionSendBidResponse,
  collectionDiscoverJerseysSchema,
  collectionPeerJerseySchema,
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
): Promise<void> {
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
