import {
  type CollectionConversationDetail,
  type CollectionConversationPeer,
  type CollectionConversations,
  type CollectionSendMessageRequest,
  collectionBlockConversationResponseSchema,
  collectionConversationDetailSchema,
  collectionConversationPeerSchema,
  collectionConversationsSchema,
  collectionReportConversationResponseSchema,
  collectionSendMessageResponseSchema,
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

export class ConversationsFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ConversationsFetchError";
  }
}

export async function fetchConversations(accessToken: string): Promise<CollectionConversations> {
  const response = await requestJson("/v1/collection/conversations", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new ConversationsFetchError("Kunne ikke hente indbakke", response.status);
  }

  return collectionConversationsSchema.parse(await response.json());
}

export async function fetchConversation(
  accessToken: string,
  conversationId: string,
): Promise<CollectionConversationDetail> {
  const response = await requestJson(`/v1/collection/conversations/${conversationId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new ConversationsFetchError("Kunne ikke hente samtale", response.status);
  }

  return collectionConversationDetailSchema.parse(await response.json());
}

export async function sendConversationMessage(
  accessToken: string,
  conversationId: string,
  body: CollectionSendMessageRequest,
): Promise<{ messageId: string }> {
  const response = await requestJson(`/v1/collection/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ConversationsFetchError("Kunne ikke sende besked", response.status);
  }

  return collectionSendMessageResponseSchema.parse(await response.json());
}

export function resolveConversationPhotoUrl(relativePath: string): string {
  if (relativePath.startsWith("http")) {
    return relativePath;
  }
  return `${getApiBaseUrl()}${relativePath}`;
}

export async function fetchConversationPeer(
  accessToken: string,
  conversationId: string,
): Promise<CollectionConversationPeer> {
  const response = await requestJson(`/v1/collection/conversations/${conversationId}/peer`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new ConversationsFetchError("Kunne ikke hente profil", response.status);
  }

  return collectionConversationPeerSchema.parse(await response.json());
}

export async function reportConversation(
  accessToken: string,
  conversationId: string,
  reason?: string,
): Promise<void> {
  const response = await requestJson(`/v1/moderation/conversations/${conversationId}/report`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
    body: JSON.stringify(reason ? { reason } : {}),
  });

  if (!response.ok) {
    throw new ConversationsFetchError("Kunne ikke rapportere", response.status);
  }

  collectionReportConversationResponseSchema.parse(await response.json());
}

export async function blockConversation(
  accessToken: string,
  conversationId: string,
): Promise<void> {
  const response = await requestJson(`/v1/moderation/conversations/${conversationId}/block`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new ConversationsFetchError("Kunne ikke blokere", response.status);
  }

  collectionBlockConversationResponseSchema.parse(await response.json());
}

export async function hideConversation(accessToken: string, conversationId: string): Promise<void> {
  const response = await requestJson(`/v1/collection/conversations/${conversationId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new ConversationsFetchError("Kunne ikke slette samtale", response.status);
  }
}
