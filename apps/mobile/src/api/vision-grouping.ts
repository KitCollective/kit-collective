import type { VisionGroupingSuggestRequest, VisionJobResponse } from "@kit/api-contract";
import {
  visionGroupingSuggestRequestSchema,
  visionJobResponseSchema,
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

export async function startVisionGroupingSuggest(
  accessToken: string,
  payload: VisionGroupingSuggestRequest,
): Promise<string> {
  const body = visionGroupingSuggestRequestSchema.parse(payload);
  const response = await requestJson("/v1/collection/vision/grouping/suggest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "da",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Kunne ikke starte Vision-gruppering");
  }

  const parsed = visionSuggestResponseSchema.parse(await response.json());
  return parsed.jobId;
}

export async function fetchVisionGroupingJob(
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
    throw new Error("Kunne ikke hente Vision-gruppering");
  }

  return visionJobResponseSchema.parse(await response.json());
}
