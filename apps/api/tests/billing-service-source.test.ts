import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const billingServicePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/billing/billing.service.ts",
);

describe("billing.service source guards", () => {
  it("imports IapVerificationFailedError from the verifier adapter, not the fake adapter", () => {
    const source = readFileSync(billingServicePath, "utf8");
    expect(source).toContain("IapVerificationFailedError");
    expect(source).toContain("./iap-verifier.adapter.js");
    expect(source).not.toContain("./fake-iap.adapter.js");
  });
});
