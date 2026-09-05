import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type MetroSvgConfig = {
  resolver: { assetExts: string[]; sourceExts: string[] };
  transformer: { babelTransformerPath: string };
};

const requireCjs = createRequire(import.meta.url);
// SAFETY: metro.config.js is committed CJS; tests only read resolver/transformer fields.
const metroConfig = requireCjs("../metro.config.js") as MetroSvgConfig;

// Guards the Metro wiring that lets `import Mark from "./x.svg"` resolve to a
// React component instead of a numeric asset id. When this contract breaks,
// BrandMark renders `got: number` at runtime (Metro's default asset handling).
describe("metro svg transformer wiring", () => {
  const { resolver, transformer } = metroConfig;

  it("routes .svg through react-native-svg-transformer's Expo entry", () => {
    expect(transformer.babelTransformerPath).toContain("react-native-svg-transformer/expo");
  });

  it("removes svg from assetExts so Metro stops treating it as a static asset", () => {
    expect(resolver.assetExts).not.toContain("svg");
  });

  it("adds svg to sourceExts so it is transformed as source", () => {
    expect(resolver.sourceExts).toContain("svg");
  });
});
