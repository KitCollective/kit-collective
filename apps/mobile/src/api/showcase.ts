import { type CollectionShowcaseJerseys, collectionShowcaseJerseysSchema } from "@kit/api-contract";
import { getApiBaseUrl } from "./config";

async function requestJson(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "da");
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
}

export async function fetchShowcaseJerseys(): Promise<CollectionShowcaseJerseys> {
  const response = await requestJson("/v1/collection/showcase/jerseys");

  if (!response.ok) {
    throw new Error("Kunne ikke hente showcase");
  }

  return collectionShowcaseJerseysSchema.parse(await response.json());
}

export function resolveShowcasePhotoUrl(photoUrl: string): string {
  if (photoUrl.startsWith("http")) {
    return photoUrl;
  }
  return `${getApiBaseUrl()}${photoUrl}`;
}
