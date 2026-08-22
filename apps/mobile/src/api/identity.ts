import {
  collectionJerseysSchema,
  type IdentityCredentials,
  type IdentityMe,
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

export async function fetchCollectionJerseys(accessToken: string) {
  const response = await requestJson("/v1/collection/jerseys", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente samling");
  }

  return collectionJerseysSchema.parse(await response.json());
}
