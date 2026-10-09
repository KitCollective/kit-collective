import type { Db } from "@kit/db";
import { resolveCatalogSide } from "../e2e/catalog-side.js";
import { FIXED_VISION_SUGGESTION } from "../e2e/test-data.fixture.js";
import type {
  VisionAdapter,
  VisionGroupingInferenceResult,
  VisionGroupingPhotoInput,
  VisionIdentityPhotoInput,
  VisionInferenceResult,
} from "./vision.adapter.js";

const FIXED_CONFIDENCE = 90;
const FIXED_MODEL = "fixed";
/** Up to three photos are one jersey; more are paired in the order they came. */
const SINGLE_JERSEY_MAX_PHOTOS = 3;
const PHOTOS_PER_GROUP = 2;

/**
 * Vision for the device-flow test Collector (KIT-267): the same suggestion for
 * any photos, no model call. The catalog side comes from the test-data fixture
 * and resolves against the catalog at hand.
 */
export class FixedVisionAdapter implements VisionAdapter {
  constructor(private readonly db: Db) {}

  async infer(_photos: VisionIdentityPhotoInput[]): Promise<VisionInferenceResult | null> {
    const side = await resolveCatalogSide(this.db, FIXED_VISION_SUGGESTION.side);
    if (!side) {
      return null;
    }
    return {
      ...(side.clubId ? { clubId: side.clubId } : {}),
      ...(side.nationalTeamId ? { nationalTeamId: side.nationalTeamId } : {}),
      seasonId: side.seasonId,
      type: FIXED_VISION_SUGGESTION.type,
      confidences: {
        overall: FIXED_CONFIDENCE,
        club: FIXED_CONFIDENCE,
        nationalTeam: FIXED_CONFIDENCE,
        season: FIXED_CONFIDENCE,
        kitType: FIXED_CONFIDENCE,
      },
      latencyMs: 0,
      model: FIXED_MODEL,
    };
  }

  async inferGrouping(
    photos: VisionGroupingPhotoInput[],
  ): Promise<VisionGroupingInferenceResult | null> {
    const photoIds = photos.map((photo) => photo.photoId);
    const size = photoIds.length <= SINGLE_JERSEY_MAX_PHOTOS ? photoIds.length : PHOTOS_PER_GROUP;
    const groups: VisionGroupingInferenceResult["groups"] = [];
    for (let start = 0; start < photoIds.length; start += size) {
      groups.push({ photoIds: photoIds.slice(start, start + size), confidence: FIXED_CONFIDENCE });
    }
    return { groups, latencyMs: 0, model: FIXED_MODEL };
  }
}
