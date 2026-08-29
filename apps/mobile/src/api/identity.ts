import {
  type HandleAvailabilityResponse,
  handleAvailabilityResponseSchema,
  type IdentityCredentials,
  type IdentityMe,
  type IdentityProfileUpdate,
  type IdentitySession,
  identityCredentialsSchema,
  identityMeSchema,
  identitySessionSchema,
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

export async function registerCollector(
  credentials: IdentityCredentials,
): Promise<IdentitySession> {
  const payload = identityCredentialsSchema.parse(credentials);
  const response = await requestJson("/v1/identity/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke oprette konto");
  }

  return identitySessionSchema.parse(await response.json());
}

export async function loginCollector(credentials: IdentityCredentials): Promise<IdentitySession> {
  const payload = identityCredentialsSchema.parse(credentials);
  const response = await requestJson("/v1/identity/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Forkert e-mail eller adgangskode");
  }

  return identitySessionSchema.parse(await response.json());
}

export async function fetchCurrentUser(accessToken: string): Promise<IdentityMe> {
  const response = await requestJson("/v1/identity/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Session udløbet");
  }

  return identityMeSchema.parse(await response.json());
}

export async function fetchHandleAvailability(
  accessToken: string,
  handle: string,
): Promise<HandleAvailabilityResponse> {
  const response = await requestJson(
    `/v1/identity/handle-availability?handle=${encodeURIComponent(handle)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Kunne ikke tjekke brugernavn");
  }

  return handleAvailabilityResponseSchema.parse(await response.json());
}

export async function updateProfile(
  accessToken: string,
  update: IdentityProfileUpdate,
): Promise<IdentityMe> {
  const response = await requestJson("/v1/identity/me", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(update),
  });

  if (response.status === 409) {
    throw new Error("Brugernavnet er optaget");
  }

  if (!response.ok) {
    throw new Error("Kunne ikke gemme profil");
  }

  return identityMeSchema.parse(await response.json());
}

export async function uploadAvatar(
  accessToken: string,
  contentBase64: string,
): Promise<IdentityMe> {
  const response = await requestJson("/v1/identity/avatar", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ contentBase64 }),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke uploade profilbillede");
  }

  return identityMeSchema.parse(await response.json());
}

export function resolveAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) {
    return null;
  }

  if (avatarUrl.startsWith("http")) {
    return avatarUrl;
  }

  return `${getApiBaseUrl()}${avatarUrl}`;
}
