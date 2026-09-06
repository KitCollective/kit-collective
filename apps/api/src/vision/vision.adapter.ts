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

export type VisionGroupingPhotoInput = {
  photoId: string;
  bytes: Uint8Array;
};

export type VisionGroupingInferenceResult = {
  groups: Array<{ photoIds: string[]; confidence: number }>;
  latencyMs?: number;
  model?: string;
};

export type VisionAdapter = {
  infer(photoBytes: Uint8Array): Promise<VisionInferenceResult | null>;
  inferGrouping?(
    photos: VisionGroupingPhotoInput[],
  ): Promise<VisionGroupingInferenceResult | null>;
};

export const VISION_ADAPTER = Symbol("VISION_ADAPTER");
