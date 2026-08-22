import type { KitType } from "@kit/domain";

export type VisionInferenceResult = {
  clubId?: string;
  seasonId?: string;
  catalogKitId?: string;
  type?: KitType;
  visionRaw?: string;
  confidences?: string;
  latencyMs?: number;
  model?: string;
};

export type VisionAdapter = {
  infer(photoBytes: Uint8Array): Promise<VisionInferenceResult | null>;
};

export const VISION_ADAPTER = Symbol("VISION_ADAPTER");
