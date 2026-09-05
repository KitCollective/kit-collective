import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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

export function resolvePortraitStoreFromEnv(): PortraitStore | undefined {
  const rootDir = process.env.SEED_OBJECT_DIR?.trim();
  if (!rootDir) {
    return undefined;
  }
  return createFsPortraitStore(rootDir);
}
