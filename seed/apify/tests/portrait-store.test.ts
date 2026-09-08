import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ObjectStoreAdapter } from "@kit/seed-fkapi/types";
import { describe, expect, it } from "vitest";
import { createMirrorPortraitStore, resolvePortraitStoreFromEnv } from "../src/portrait-store.js";

const R2_KEYS = [
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SEED_OBJECT_DIR",
] as const;

function snapshotEnv(): {
  R2_ENDPOINT: string | undefined;
  R2_BUCKET: string | undefined;
  R2_ACCESS_KEY_ID: string | undefined;
  R2_SECRET_ACCESS_KEY: string | undefined;
  SEED_OBJECT_DIR: string | undefined;
} {
  const previous = {
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    SEED_OBJECT_DIR: process.env.SEED_OBJECT_DIR,
  };
  for (const key of R2_KEYS) {
    delete process.env[key];
  }
  return previous;
}

function restoreEnv(previous: ReturnType<typeof snapshotEnv>): void {
  for (const key of R2_KEYS) {
    const value = previous[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("resolvePortraitStoreFromEnv", () => {
  it("writes through the shared R2 client when R2_* is set", async () => {
    const previous = snapshotEnv();
    const puts: { key: string; bytes: Uint8Array }[] = [];
    process.env.R2_ENDPOINT = "https://r2.example.invalid";
    process.env.R2_BUCKET = "kc-test";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    try {
      const fakeR2 = (): ObjectStoreAdapter => ({
        async putObject(key, bytes) {
          puts.push({ key, bytes });
        },
        async objectExists() {
          return false;
        },
      });
      const store = resolvePortraitStoreFromEnv(process.env, fakeR2);
      expect(store).toBeDefined();
      const bytes = Uint8Array.from([255, 216, 255, 224]);
      await store?.putObject("player/11110/portrait", bytes);
      expect(puts).toEqual([{ key: "player/11110/portrait", bytes }]);
    } finally {
      restoreEnv(previous);
    }
  });

  it("uses SEED_OBJECT_DIR when R2_* is unset", async () => {
    const previous = snapshotEnv();
    process.env.SEED_OBJECT_DIR = "/tmp/kit-portrait-stand-in";
    try {
      const store = resolvePortraitStoreFromEnv(process.env, () => {
        throw new Error("must not construct R2");
      });
      expect(store).toBeDefined();
    } finally {
      restoreEnv(previous);
    }
  });

  it("returns undefined when neither R2 nor SEED_OBJECT_DIR is set", () => {
    const previous = snapshotEnv();
    try {
      expect(resolvePortraitStoreFromEnv(process.env)).toBeUndefined();
    } finally {
      restoreEnv(previous);
    }
  });

  it("mirrors to disk and R2 when both names are set", async () => {
    const previous = snapshotEnv();
    const puts: string[] = [];
    const objectDir = await mkdtemp(path.join(tmpdir(), "kit-portrait-mirror-"));
    process.env.R2_ENDPOINT = "https://r2.example.invalid";
    process.env.R2_BUCKET = "kc-test";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.SEED_OBJECT_DIR = objectDir;
    try {
      const store = resolvePortraitStoreFromEnv(process.env, () => ({
        async putObject(key) {
          puts.push(key);
        },
        async objectExists() {
          return false;
        },
      }));
      const bytes = Uint8Array.from([255, 216, 255, 224]);
      await store?.putObject("player/11110/portrait", bytes);

      expect(puts).toEqual(["player/11110/portrait"]);
      expect(await readFile(path.join(objectDir, "player/11110/portrait"))).toEqual(
        Buffer.from(bytes),
      );
    } finally {
      restoreEnv(previous);
    }
  });
});

describe("createMirrorPortraitStore", () => {
  it("keeps the mirror write when the primary fails", async () => {
    const mirrored: string[] = [];
    const store = createMirrorPortraitStore(
      {
        async putObject() {
          throw new Error("R2 refused");
        },
      },
      {
        async putObject(key) {
          mirrored.push(key);
        },
      },
    );

    await store.putObject("player/1/portrait", new Uint8Array([1]));

    expect(mirrored).toEqual(["player/1/portrait"]);
  });

  it("throws when neither target accepted the bytes", async () => {
    const failing = {
      async putObject() {
        throw new Error("down");
      },
    };
    const store = createMirrorPortraitStore(failing, failing);

    await expect(store.putObject("player/1/portrait", new Uint8Array([1]))).rejects.toThrow(
      /not stored/,
    );
  });
});
