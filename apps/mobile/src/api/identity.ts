import {
  type AuthEvents,
  acceptAllCookieConsent,
  authEventsSchema,
  type CookieConsent,
  type CookieConsentUpdate,
  cookieConsentSchema,
  essentialOnlyCookieConsent,
  type HandleAvailabilityResponse,
  handleAvailabilityResponseSchema,
  type IdentityAccountUpdate,
  type IdentityExport,
  type IdentityLinkedProvider,
  type IdentityMe,
  type IdentityPrefs,
  type IdentityPrefsUpdate,
  type IdentityProfileUpdate,
  type IdentitySession,
  identityCodeAcceptedSchema,
  identityExportSchema,
  identityLinkedProviderSchema,
  identityMeSchema,
  identityPrefsSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { identityAuthErrorFromResponse } from "@/auth/identity-auth-error";
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

/** Asks for a six-digit code by e-mail. The answer is the same for a new and an existing e-mail. */
export async function requestSignInCode(email: string): Promise<void> {
  const response = await requestJson("/v1/identity/code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw identityAuthErrorFromResponse(response, {
      fallbackMessage: "Kunne ikke sende koden",
    });
  }

  identityCodeAcceptedSchema.parse(await response.json());
}

/** A correct code registers or signs in. 401 wrong code, 410 expired, 429 too many attempts. */
export async function verifySignInCode(email: string, code: string): Promise<IdentitySession> {
  const response = await requestJson("/v1/identity/code/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });

  if (!response.ok) {
    throw identityAuthErrorFromResponse(response, {
      fallbackMessage: "Kunne ikke bekræfte koden",
    });
  }

  return identitySessionSchema.parse(await response.json());
}

export async function loginSocial(
  provider: IdentityLinkedProvider,
  idToken: string,
): Promise<IdentitySession> {
  const payload = {
    provider: identityLinkedProviderSchema.parse(provider),
    idToken,
  };
  const response = await requestJson("/v1/identity/social", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw identityAuthErrorFromResponse(response, {
      fallbackMessage: "Kunne ikke logge ind",
    });
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

export async function updateAccount(
  accessToken: string,
  update: IdentityAccountUpdate,
): Promise<IdentityMe> {
  const response = await requestJson("/v1/identity/account", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke gemme kontooplysninger");
  }

  return identityMeSchema.parse(await response.json());
}

export async function deleteAccount(accessToken: string): Promise<void> {
  const response = await requestJson("/v1/identity/me", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke slette konto");
  }
}

export async function logoutSession(accessToken: string): Promise<void> {
  await requestJson("/v1/identity/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function fetchAuthEvents(accessToken: string): Promise<AuthEvents> {
  const response = await requestJson("/v1/identity/auth-events", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente login-historik");
  }

  return authEventsSchema.parse(await response.json());
}

export async function revokeAllSessions(accessToken: string): Promise<void> {
  const response = await requestJson("/v1/identity/sessions/revoke-all", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke logge ud overalt");
  }
}

export async function fetchPrefs(accessToken: string): Promise<IdentityPrefs> {
  const response = await requestJson("/v1/identity/prefs", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente indstillinger");
  }

  return identityPrefsSchema.parse(await response.json());
}

export async function updatePrefs(
  accessToken: string,
  update: IdentityPrefsUpdate,
): Promise<IdentityPrefs> {
  const response = await requestJson("/v1/identity/prefs", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke gemme indstillinger");
  }

  return identityPrefsSchema.parse(await response.json());
}

export async function fetchCookieConsent(accessToken: string): Promise<CookieConsent> {
  const response = await requestJson("/v1/identity/cookie-consent", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente cookie-valg");
  }

  return cookieConsentSchema.parse(await response.json());
}

export async function updateCookieConsent(
  accessToken: string,
  update: CookieConsentUpdate,
): Promise<CookieConsent> {
  const response = await requestJson("/v1/identity/cookie-consent", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke gemme cookie-valg");
  }

  return cookieConsentSchema.parse(await response.json());
}

export async function fetchAccountExport(accessToken: string): Promise<IdentityExport> {
  const response = await requestJson("/v1/identity/export", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente kontodata");
  }

  return identityExportSchema.parse(await response.json());
}

export { acceptAllCookieConsent, essentialOnlyCookieConsent };
