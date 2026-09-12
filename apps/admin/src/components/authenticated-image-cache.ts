import { getApiBase, joinApiPath } from "../api/client.js";

const blobUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheKey(path: string, token: string): string {
  return `${path}\0${token}`;
}

export function peekAuthenticatedBlob(path: string, token: string): string | null {
  return blobUrls.get(cacheKey(path, token)) ?? null;
}

export function loadAuthenticatedBlob(path: string, token: string): Promise<string> {
  const key = cacheKey(path, token);
  const cached = blobUrls.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }
  const request = fetch(joinApiPath(getApiBase(), path), {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load image");
      }
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      blobUrls.set(key, objectUrl);
      inflight.delete(key);
      return objectUrl;
    })
    .catch((error: unknown) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, request);
  return request;
}

export function clearAuthenticatedBlobCache(): void {
  for (const url of blobUrls.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrls.clear();
  inflight.clear();
}
