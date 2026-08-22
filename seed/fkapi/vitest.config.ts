import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 30_000,
  },
});
