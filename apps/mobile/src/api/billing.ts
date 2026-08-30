import { billingStartTrialResponseSchema, type Entitlement } from "@kit/api-contract";
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

export async function startNestTrial(accessToken: string): Promise<Entitlement> {
  const response = await requestJson("/v1/billing/trial", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 409) {
    throw new Error("Trial allerede brugt");
  }

  if (!response.ok) {
    throw new Error("Kunne ikke starte prøveperiode");
  }

  return billingStartTrialResponseSchema.parse(await response.json());
}
