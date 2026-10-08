import { type CollectionActivity, collectionActivitySchema } from "@kit/api-contract";
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

export async function fetchActivity(
  accessToken: string,
  locale = "da",
): Promise<CollectionActivity> {
  const response = await requestJson("/v1/collection/activity", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": locale,
    },
  });

  if (!response.ok) {
    throw new Error(`Activity fetch failed: ${response.status}`);
  }

  return collectionActivitySchema.parse(await response.json());
}
