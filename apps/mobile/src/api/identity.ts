import {
  acceptAllCookieConsent,
  type CookieConsent,
  type CookieConsentUpdate,
  cookieConsentSchema,
  essentialOnlyCookieConsent,
  type HandleAvailabilityResponse,
  handleAvailabilityResponseSchema,
  type IdentityAccountUpdate,
  type IdentityCredentials,
  type IdentityEmailChange,
  type IdentityExport,
  type IdentityLinkedProvider,
  type IdentityMe,
  type IdentityPasswordChange,
  type IdentityPrefs,
  type IdentityPrefsUpdate,
  type IdentityProfileUpdate,
  type IdentitySession,
  identityCredentialsSchema,
  identityExportSchema,
  identityLinkedProviderSchema,
  identityMeSchema,
  identityPasswordResetAcceptedSchema,
  identityPrefsSchema,
  identitySessionSchema,
  identityVerifyResponseSchema,
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
    throw new Error("Kunne ikke logge ind");
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

export async function changePassword(
  accessToken: string,
  payload: IdentityPasswordChange,
): Promise<void> {
  const response = await requestJson("/v1/identity/password", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new Error("Nuværende adgangskode er forkert");
  }

  if (!response.ok) {
    throw new Error("Kunne ikke skifte adgangskode");
  }
}

export async function changeEmail(
  accessToken: string,
  payload: IdentityEmailChange,
): Promise<IdentityMe> {
  const response = await requestJson("/v1/identity/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new Error("Adgangskoden er forkert");
  }

  if (response.status === 409) {
    throw new Error("E-mailen er allerede i brug");
  }

  if (!response.ok) {
    throw new Error("Kunne ikke skifte e-mail");
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

export async function verifyEmail(token: string): Promise<void> {
  const response = await requestJson("/v1/identity/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error("Linket er ugyldigt eller udløbet");
  }

  identityVerifyResponseSchema.parse(await response.json());
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await requestJson("/v1/identity/password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke sende nulstilling");
  }

  identityPasswordResetAcceptedSchema.parse(await response.json());
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
  const response = await requestJson("/v1/identity/password-reset/complete", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });

  if (!response.ok) {
    throw new Error("Linket er ugyldigt eller udløbet");
  }

  identityPasswordResetAcceptedSchema.parse(await response.json());
}

export { acceptAllCookieConsent, essentialOnlyCookieConsent };
