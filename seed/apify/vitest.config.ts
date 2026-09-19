import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
