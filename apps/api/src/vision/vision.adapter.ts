import type { KitType } from "@kit/domain";

export type VisionFieldConfidences = {
  overall: number;
  club?: number;
  season?: number;
  kitType?: number;
};

export type VisionInferenceResult = {
  clubId?: string;
  seasonId?: string;
  catalogKitId?: string;
  type?: KitType;
  visionRaw?: string;
  confidences?: VisionFieldConfidences;
  latencyMs?: number;
  model?: string;
};

export type VisionAdapter = {
  infer(photoBytes: Uint8Array): Promise<VisionInferenceResult | null>;
};

export const VISION_ADAPTER = Symbol("VISION_ADAPTER");
