import type { Db } from "@kit/db";
import { isProductionProcess } from "../config/production-process.js";
import { TEST_COLLECTOR_ID } from "../e2e/test-data.fixture.js";
import { CollectorScopedVisionAdapter } from "./collector-scoped-vision.adapter.js";
import { FixedVisionAdapter } from "./fixed-vision.adapter.js";
import { createGeminiVisionAdapter } from "./gemini-vision.adapter.js";
import type { VisionAdapter } from "./vision.adapter.js";

/**
 * The live adapter, unless `VISION_FIXED_FOR_TEST_COLLECTOR=on` (the local API
 * the device flows run against): then the device-flow test Collector gets fixed
 * suggestions and every other Collector still gets the live adapter. A
 * production process ignores the switch.
 */
export function createVisionAdapter(db: Db): VisionAdapter {
  const live = createGeminiVisionAdapter(db);
  if (
    isProductionProcess(process.env.NODE_ENV) ||
    process.env.VISION_FIXED_FOR_TEST_COLLECTOR?.trim().toLowerCase() !== "on"
  ) {
    return live;
  }
  return new CollectorScopedVisionAdapter(live, new FixedVisionAdapter(db), TEST_COLLECTOR_ID);
}
