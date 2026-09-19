import {
  type CollectionAddFavoriteRequest,
  type CollectionFavorites,
  collectionAddFavoriteRequestSchema,
  collectionFavoritesSchema,
} from "@kit/api-contract";
import { getApiBaseUrl } from "./config";

export class FavoritesFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FavoritesFetchError";
  }
}

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

export async function fetchFavorites(accessToken: string): Promise<CollectionFavorites> {
  const response = await requestJson("/v1/collection/favorites", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new FavoritesFetchError("Kunne ikke hente favoritter", response.status);
  }

  return collectionFavoritesSchema.parse(await response.json());
}

export async function addFavorite(
  accessToken: string,
  payload: CollectionAddFavoriteRequest,
): Promise<void> {
  const body = collectionAddFavoriteRequestSchema.parse(payload);
  const response = await requestJson("/v1/collection/favorites", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new FavoritesFetchError("Kunne ikke gemme favorit", response.status);
  }
}

export async function removeFavorite(accessToken: string, userJerseyId: string): Promise<void> {
  const response = await requestJson(`/v1/collection/favorites/${userJerseyId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new FavoritesFetchError("Kunne ikke fjerne favorit", response.status);
  }
}
