import {
  type CollectionJersey,
  type CollectionJerseys,
  type CollectionJerseyUpdate,
  type CollectionPhotoVariantQuery,
  type CollectionSaveRequest,
  type CollectionSaveResponse,
  collectionJerseySchema,
  collectionJerseysSchema,
  collectionJerseyUpdateResponseSchema,
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

export class CollectionFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CollectionFetchError";
  }
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
    throw new CollectionFetchError("Kunne ikke hente samling", response.status);
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

export async function updateUserJersey(
  accessToken: string,
  jerseyId: string,
  payload: CollectionJerseyUpdate,
): Promise<CollectionJersey> {
  const response = await requestJson(`/v1/collection/jerseys/${jerseyId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new CollectionFetchError("Kunne ikke opdatere trøjen", response.status);
  }

  const body = collectionJerseyUpdateResponseSchema.parse(await response.json());
  return collectionJerseySchema.parse(body.jersey);
}

export async function deleteUserJersey(accessToken: string, jerseyId: string): Promise<void> {
  const response = await requestJson(`/v1/collection/jerseys/${jerseyId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new CollectionFetchError("Kunne ikke slette trøjen", response.status);
  }
}

export function resolvePhotoUrl(
  photoUrl: string,
  variant?: CollectionPhotoVariantQuery,
): string {
  const base = photoUrl.startsWith("http") ? photoUrl : `${getApiBaseUrl()}${photoUrl}`;
  if (!variant) {
    return base;
  }
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}variant=${variant}`;
}

export async function uploadPhotoOriginal(
  accessToken: string,
  photoId: string,
  contentBase64: string,
): Promise<void> {
  const response = await requestJson(`/v1/collection/photos/${photoId}/original`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ contentBase64 }),
  });

  if (!response.ok) {
    throw new CollectionFetchError("Kunne ikke uploade originalfoto", response.status);
  }
}
