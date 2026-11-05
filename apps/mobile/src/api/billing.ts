import {
  billingIapResponseSchema,
  billingStartTrialResponseSchema,
  type Entitlement,
  type IapRestoreRequest,
  type IapVerifyRequest,
  type Offer,
  offerSchema,
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

export async function fetchBillingOffer(accessToken: string): Promise<Offer> {
  const response = await requestJson("/v1/billing/offer", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente tilbuddet");
  }

  return offerSchema.parse(await response.json());
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

export async function verifyIapPurchase(
  accessToken: string,
  body: IapVerifyRequest,
): Promise<Entitlement> {
  const response = await requestJson("/v1/billing/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 422) {
    throw new Error("Ugyldigt køb");
  }

  if (!response.ok) {
    throw new Error("Kunne ikke bekræfte køb");
  }

  return billingIapResponseSchema.parse(await response.json());
}

export async function restoreIapPurchases(
  accessToken: string,
  body: IapRestoreRequest,
): Promise<Entitlement> {
  const response = await requestJson("/v1/billing/restore", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 422) {
    throw new Error("Ugyldigt køb");
  }

  if (!response.ok) {
    throw new Error("Kunne ikke gendanne køb");
  }

  return billingIapResponseSchema.parse(await response.json());
}
