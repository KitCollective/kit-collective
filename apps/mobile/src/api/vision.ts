import {
  type VisionJobResponse,
  type VisionLogRequest,
  type VisionSuggestRequest,
  visionJobResponseSchema,
  visionLogResponseSchema,
  visionSuggestResponseSchema,
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

export async function startVisionSuggest(
  accessToken: string,
  payload: VisionSuggestRequest,
): Promise<string> {
  const response = await requestJson("/v1/collection/vision/suggest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke starte Vision");
  }

  const body = visionSuggestResponseSchema.parse(await response.json());
  return body.jobId;
}

export async function fetchVisionJob(
  accessToken: string,
  jobId: string,
): Promise<VisionJobResponse> {
  const response = await requestJson(`/v1/collection/vision/jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente Vision-forslag");
  }

  return visionJobResponseSchema.parse(await response.json());
}

export async function logVisionAction(
  accessToken: string,
  payload: VisionLogRequest,
): Promise<void> {
  const response = await requestJson("/v1/collection/vision/log", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke logge Vision-handling");
  }

  visionLogResponseSchema.parse(await response.json());
}

export async function startUnsignedVisionSuggest(payload: VisionSuggestRequest): Promise<string> {
  const response = await requestJson("/v1/collection/vision/suggest/unsigned", {
    method: "POST",
    headers: {
      "Accept-Language": "da",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke starte Vision");
  }

  const body = visionSuggestResponseSchema.parse(await response.json());
  return body.jobId;
}

export async function fetchUnsignedVisionJob(jobId: string): Promise<VisionJobResponse> {
  const response = await requestJson(`/v1/collection/vision/jobs/${jobId}/unsigned`, {
    headers: {
      "Accept-Language": "da",
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente Vision-forslag");
  }

  return visionJobResponseSchema.parse(await response.json());
}
