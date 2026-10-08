import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createR2ObjectStore } from "@kit/seed-fkapi/object-store";
import type { ObjectStoreAdapter } from "@kit/seed-fkapi/types";
import type { PortraitStore } from "./map/index.js";
import { seedProgress } from "./progress.js";

/** Filesystem stand-in for the lane object store. Keys match R2 (`player/{id}/portrait`). */
export function createFsPortraitStore(rootDir: string): PortraitStore {
  return {
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      const dest = path.join(rootDir, key);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
    },
  };
}

function r2CredentialsComplete(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.R2_ENDPOINT?.trim() &&
      env.R2_BUCKET?.trim() &&
      env.R2_ACCESS_KEY_ID?.trim() &&
      env.R2_SECRET_ACCESS_KEY?.trim(),
  );
}

/**
 * Writes the lane bucket and keeps a local copy. A bulk run must not lose the bytes it
 * already paid Transfermarkt for, so a failing primary is a logged hole, not a dead run.
 */
export function createMirrorPortraitStore(
  primary: PortraitStore,
  mirror: PortraitStore,
): PortraitStore {
  return {
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      const failures: string[] = [];
      for (const [name, store] of [
        ["primary", primary],
        ["mirror", mirror],
      ] as const) {
        try {
          await store.putObject(key, bytes);
        } catch (error: unknown) {
          failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (failures.length === 0) {
        return;
      }
      if (failures.length === 2) {
        throw new Error(`portrait ${key} not stored (${failures.join("; ")})`);
      }
      seedProgress(`portrait ${key} partially stored (${failures.join("; ")})`);
    },
  };
}

/**
 * Lane object store: R2 when `R2_*` is set (same client as FK kit photos), mirrored to
 * `SEED_OBJECT_DIR` when that is set too. Either name alone is the whole store.
 */
export function resolvePortraitStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  createR2: () => ObjectStoreAdapter = createR2ObjectStore,
): PortraitStore | undefined {
  const rootDir = env.SEED_OBJECT_DIR?.trim();

  if (r2CredentialsComplete(env)) {
    const store = createR2();
    const r2Store: PortraitStore = {
      putObject: (key, bytes) => store.putObject(key, bytes),
    };
    if (!rootDir) {
      return r2Store;
    }
    return createMirrorPortraitStore(r2Store, createFsPortraitStore(rootDir));
  }

  if (!rootDir) {
    return undefined;
  }
  return createFsPortraitStore(rootDir);
}
