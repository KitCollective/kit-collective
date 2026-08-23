import {
  type CollectionShortcut,
  type CollectionShortcutWrite,
  type CollectionShortcuts,
  collectionShortcutSchema,
  collectionShortcutsSchema,
} from "@kit/api-contract";
import { getApiBaseUrl } from "./config";

async function requestJson(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "da");
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
}

export async function fetchCollectionShortcuts(accessToken: string): Promise<CollectionShortcuts> {
  const response = await requestJson("/v1/collection/shortcuts", accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke hente genveje");
  }

  return collectionShortcutsSchema.parse(await response.json());
}

export async function createCollectionShortcut(
  accessToken: string,
  payload: CollectionShortcutWrite,
): Promise<CollectionShortcut> {
  const response = await requestJson("/v1/collection/shortcuts", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke oprette genvej");
  }

  return collectionShortcutSchema.parse(await response.json());
}

export async function updateCollectionShortcut(
  accessToken: string,
  shortcutId: string,
  payload: CollectionShortcutWrite,
): Promise<CollectionShortcut> {
  const response = await requestJson(`/v1/collection/shortcuts/${shortcutId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke opdatere genvej");
  }

  return collectionShortcutSchema.parse(await response.json());
}

export async function reorderCollectionShortcuts(
  accessToken: string,
  orderedIds: string[],
): Promise<CollectionShortcuts> {
  const response = await requestJson("/v1/collection/shortcuts/reorder", accessToken, {
    method: "PUT",
    body: JSON.stringify({ orderedIds }),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke omarrangere genveje");
  }

  return collectionShortcutsSchema.parse(await response.json());
}

export async function deleteCollectionShortcut(
  accessToken: string,
  shortcutId: string,
): Promise<void> {
  const response = await requestJson(`/v1/collection/shortcuts/${shortcutId}`, accessToken, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Kunne ikke slette genvej");
  }
}
