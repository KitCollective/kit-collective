import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createR2ObjectStore } from "@kit/seed-fkapi/object-store";
import type { ObjectStoreAdapter } from "@kit/seed-fkapi/types";
import type { PortraitStore } from "./map/index.js";

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
 * Lane object store: R2 when `R2_*` is set (same client as FK kit photos).
 * `SEED_OBJECT_DIR` is the local/CI stand-in when R2 is unset.
 */
export function resolvePortraitStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  createR2: () => ObjectStoreAdapter = createR2ObjectStore,
): PortraitStore | undefined {
  if (r2CredentialsComplete(env)) {
    const store = createR2();
    return {
      putObject: (key, bytes) => store.putObject(key, bytes),
    };
  }
  const rootDir = env.SEED_OBJECT_DIR?.trim();
  if (!rootDir) {
    return undefined;
  }
  return createFsPortraitStore(rootDir);
}
