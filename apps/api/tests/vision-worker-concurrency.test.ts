import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { VISION_WORKER_CONCURRENCY } from "../src/vision/vision.processor.js";

describe("vision worker concurrency", () => {
  it("runs multiple identity jobs in parallel instead of one-at-a-time", () => {
    expect(VISION_WORKER_CONCURRENCY).toBe(8);
  });
});
