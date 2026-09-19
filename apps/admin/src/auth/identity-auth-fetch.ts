import { getApiBase, joinApiPath } from "../api/client.js";
import { throwIdentityAuthError } from "./identity-auth-error.js";

export async function identityAuthFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(joinApiPath(getApiBase(), path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    await throwIdentityAuthError(response, {
      invalidCredentialsMessage: "Invalid email or password",
      fallbackMessage: "Sign in failed",
    });
  }

  return response;
}
