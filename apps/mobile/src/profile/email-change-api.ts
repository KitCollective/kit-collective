import { type IdentityMe, identityCodeAcceptedSchema, identityMeSchema } from "@kit/api-contract";
import { getApiBaseUrl } from "@/api/config";
import { identityAuthErrorFromResponse } from "@/auth/identity-auth-error";

async function postJson(path: string, accessToken: string, body: unknown): Promise<Response> {
  return fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Mails a six-digit code to the new address. The answer is the same for a free and a taken one. */
export async function requestEmailChangeCode(accessToken: string, email: string): Promise<void> {
  const response = await postJson("/v1/identity/email/code", accessToken, { email });

  if (!response.ok) {
    throw identityAuthErrorFromResponse(response, {
      fallbackMessage: "Kunne ikke sende koden",
    });
  }

  identityCodeAcceptedSchema.parse(await response.json());
}

/** A correct code switches the address. 401 wrong, 409 taken, 410 expired, 429 too many attempts. */
export async function confirmEmailChange(
  accessToken: string,
  email: string,
  code: string,
): Promise<IdentityMe> {
  const response = await postJson("/v1/identity/email/verify", accessToken, { email, code });

  if (!response.ok) {
    throw identityAuthErrorFromResponse(response, {
      fallbackMessage: "Kunne ikke bekræfte koden",
    });
  }

  return identityMeSchema.parse(await response.json());
}
