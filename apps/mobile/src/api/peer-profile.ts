import {
  type CollectionPeerJerseys,
  collectionPeerJerseysSchema,
  type IdentityPeerProfile,
  identityPeerProfileSchema,
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

export class PeerProfileFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PeerProfileFetchError";
  }
}

export async function fetchPeerProfileByHandle(
  accessToken: string,
  handle: string,
): Promise<IdentityPeerProfile> {
  const response = await requestJson(`/v1/identity/peers/by-handle/${encodeURIComponent(handle)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new PeerProfileFetchError("Peer profil ikke fundet", response.status);
  }

  return identityPeerProfileSchema.parse(await response.json());
}

export async function fetchPeerJerseys(
  accessToken: string,
  peerId: string,
): Promise<CollectionPeerJerseys> {
  const response = await requestJson(`/v1/collection/peers/${peerId}/jerseys`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new PeerProfileFetchError("Peer trøjer ikke fundet", response.status);
  }

  return collectionPeerJerseysSchema.parse(await response.json());
}

export function resolvePeerAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) {
    return null;
  }

  if (avatarUrl.startsWith("http")) {
    return avatarUrl;
  }

  return `${getApiBaseUrl()}${avatarUrl}`;
}
