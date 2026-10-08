import {
  billingPaywallErrorSchema,
  type WishlistEntries,
  type WishlistEntry,
  type WishlistEntryWrite,
  wishlistEntriesSchema,
  wishlistEntrySchema,
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

export class WishlistPremiumRequiredError extends Error {
  constructor() {
    super("Premium is required");
    this.name = "WishlistPremiumRequiredError";
  }
}

async function parseWishlistError(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  if (body) {
    const parsed = billingPaywallErrorSchema.safeParse(body);
    if (parsed.success && parsed.data.code === "PREMIUM_REQUIRED") {
      throw new WishlistPremiumRequiredError();
    }
  }

  throw new Error("Kunne ikke opdatere ønskeliste");
}

export async function fetchWishlistEntries(accessToken: string): Promise<WishlistEntries> {
  const response = await requestJson("/v1/wishlist/entries", accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke hente ønskeliste");
  }

  return wishlistEntriesSchema.parse(await response.json());
}

export async function createWishlistEntry(
  accessToken: string,
  payload: WishlistEntryWrite,
): Promise<WishlistEntry> {
  const response = await requestJson("/v1/wishlist/entries", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (response.status === 402) {
    await parseWishlistError(response);
  }

  if (!response.ok) {
    throw new Error("Kunne ikke oprette ønske");
  }

  return wishlistEntrySchema.parse(await response.json());
}

export async function updateWishlistEntry(
  accessToken: string,
  entryId: string,
  payload: WishlistEntryWrite,
): Promise<WishlistEntry> {
  const response = await requestJson(`/v1/wishlist/entries/${entryId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  if (response.status === 402) {
    await parseWishlistError(response);
  }

  if (!response.ok) {
    throw new Error("Kunne ikke opdatere ønske");
  }

  return wishlistEntrySchema.parse(await response.json());
}

export async function deleteWishlistEntry(accessToken: string, entryId: string): Promise<void> {
  const response = await requestJson(`/v1/wishlist/entries/${entryId}`, accessToken, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Kunne ikke slette ønske");
  }
}
