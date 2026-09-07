import type { KitType } from "@kit/domain";

export type VisionFieldConfidences = {
  overall: number;
  club?: number;
  season?: number;
  kitType?: number;
  player?: number;
  badge?: number;
};

export type VisionInferenceResult = {
  clubId?: string;
  seasonId?: string;
  catalogKitId?: string;
  type?: KitType;
  playerId?: string;
  playerNumber?: string;
  patchId?: string;
  /** Raw model club hint — used to detect catalog miss when clubId is absent. */
  clubHint?: string;
  visionRaw?: string;
  confidences?: VisionFieldConfidences;
  latencyMs?: number;
  model?: string;
};

export type VisionIdentityPhotoInput = {
  photoId?: string;
  role?: string;
  bytes: Uint8Array;
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
  infer(photos: VisionIdentityPhotoInput[]): Promise<VisionInferenceResult | null>;
  inferGrouping?(photos: VisionGroupingPhotoInput[]): Promise<VisionGroupingInferenceResult | null>;
};

export const VISION_ADAPTER = Symbol("VISION_ADAPTER");
