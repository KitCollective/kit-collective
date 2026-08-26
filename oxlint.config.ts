import { defineConfig } from "oxlint";

/**
 * Only the vendored anti-slop plugin runs here; style and correctness live in biome.json.
 * See tools/oxlint/anti-slop/README.md for which upstream rules were left out and why.
 */
export default defineConfig({
  ignorePatterns: [
    ".cursor/**",
    ".scratch/**",
    "**/dist/**",
    "**/fixtures/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
  categories: { correctness: "off" },
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    // Warn only: the remaining sites are the raw Transfermarkt / Football Kit Archive
    // payloads that normalizeRawKit and normalize() exist to parse. Ratchet to error
    // once those adapters parse through a schema.
    "anti-slop/no-unsafe-dictionary-type": "warn",
    "anti-slop/no-module-mocking": "error",
  },
});
