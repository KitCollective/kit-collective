import {
  type CollectionJerseys,
  type CollectionSaveRequest,
  type CollectionSaveResponse,
  collectionJerseysSchema,
  collectionSaveRequestSchema,
  collectionSaveResponseSchema,
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

export async function fetchCollectionJerseys(
  accessToken: string,
  shortcutId?: string | null,
): Promise<CollectionJerseys> {
  const query = shortcutId ? `?shortcutId=${encodeURIComponent(shortcutId)}` : "";
  const response = await requestJson(`/v1/collection/jerseys${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente samling");
  }

  return collectionJerseysSchema.parse(await response.json());
}

export async function saveUserJersey(
  accessToken: string,
  payload: CollectionSaveRequest,
): Promise<CollectionSaveResponse> {
  const body = collectionSaveRequestSchema.parse(payload);
  const response = await requestJson("/v1/collection/jerseys/save", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke gemme trøjen");
  }

  return collectionSaveResponseSchema.parse(await response.json());
}

export function resolvePhotoUrl(photoUrl: string): string {
  if (photoUrl.startsWith("http")) {
    return photoUrl;
  }
  return `${getApiBaseUrl()}${photoUrl}`;
}
