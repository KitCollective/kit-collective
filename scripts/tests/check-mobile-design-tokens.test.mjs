import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkComposedPixelReserveExports,
  extractExportedFunctionBodies,
  findComposedPixelReserveViolations,
  isComposedPixelReserveExport,
} from "../check-mobile-design-tokens.mjs";

test("isComposedPixelReserveExport detects multi-token reserve helpers", () => {
  const body = `
    const insets = useSafeAreaInsets();
    return (
      space.insetLg * 2 +
      space.insetMd +
      space.insetLg +
      space.insetSm +
      insets.bottom +
      space.insetMd
    );
  `;
  assert.equal(isComposedPixelReserveExport(body), true);
});

test("isComposedPixelReserveExport ignores single-token padding", () => {
  const body = "return space.insetMd + insets.bottom;";
  assert.equal(isComposedPixelReserveExport(body), false);
});

test("extractExportedFunctionBodies finds exported functions", () => {
  const source = `
    export function useTabBarContentPadding(): number {
      return space.insetLg + space.insetMd + space.insetSm;
    }
  `;
  const functions = extractExportedFunctionBodies(source);
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "useTabBarContentPadding");
});

test("checkComposedPixelReserveExports passes on current tree", () => {
  const violations = checkComposedPixelReserveExports();
  assert.deepEqual(violations, []);
});

test("findComposedPixelReserveViolations fails when a reserve helper is reused", () => {
  const fileSources = new Map([
    [
      "apps/mobile/src/components/fake.ts",
      `
        export function useTabBarContentPadding(): number {
          return space.insetLg + space.insetMd + space.insetLg + space.insetSm;
        }
      `,
    ],
    [
      "apps/mobile/app/(tabs)/search.tsx",
      `import { useTabBarContentPadding } from "@/components/fake";`,
    ],
    [
      "apps/mobile/app/(tabs)/profile.tsx",
      `import { useTabBarContentPadding } from "@/components/fake";`,
    ],
  ]);

  const violations = findComposedPixelReserveViolations(fileSources);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /useTabBarContentPadding/);
});
