import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VISION_JSON_BODY_LIMIT_BYTES } from "../src/vision/vision-http-limits.js";

describe("vision HTTP body limit", () => {
  it("raises Fastify JSON bodyLimit above 1MiB for identity photo POSTs", () => {
    const main = readFileSync(join(__dirname, "../src/main.ts"), "utf8");
    expect(VISION_JSON_BODY_LIMIT_BYTES).toBeGreaterThan(1024 * 1024);
    expect(main).toContain("VISION_JSON_BODY_LIMIT_BYTES");
    expect(main).toContain("bodyLimit: VISION_JSON_BODY_LIMIT_BYTES");
  });
});
