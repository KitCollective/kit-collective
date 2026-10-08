import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SAFETY: tsconfig.json is committed JSON; the test only reads compilerOptions.paths.
const tsconfig = JSON.parse(readFileSync(join(__dirname, "../tsconfig.json"), "utf8")) as {
  compilerOptions: { paths?: Record<string, string[]> };
};

describe("mobile tsconfig paths", () => {
  it("does not alias runtime react to the types package Metro cannot bundle", () => {
    const reactPath = tsconfig.compilerOptions.paths?.react ?? [];

    expect(reactPath.join("")).not.toContain("@types/react");
  });
});
