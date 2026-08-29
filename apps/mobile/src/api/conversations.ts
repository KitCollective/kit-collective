import { type CollectionConversations, collectionConversationsSchema } from "@kit/api-contract";
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
