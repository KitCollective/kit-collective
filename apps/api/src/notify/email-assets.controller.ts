import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Controller, Get, Header, NotFoundException, Param, StreamableFile } from "@nestjs/common";
import { EMAIL_ASSET_FILES } from "./assets.js";

const ALLOWED = new Set(EMAIL_ASSET_FILES);

/** `dist/notify` and `src/notify` both sit three levels under the API's `assets` folder. */
function assetDirectory(): string {
  const override = process.env.EMAIL_ASSET_DIR?.trim();
  if (override) {
    return override;
  }
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "../../assets/email");
}

/**
 * Serves the mail images (lockup, boards, curved edge) over a public, cacheable URL. Names are
 * versioned, so the cache never needs to be told something changed. Only manifest names are served.
 */
@Controller("email/assets")
export class EmailAssetsController {
  @Get(":file")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async get(@Param("file") file: string): Promise<StreamableFile> {
    if (!ALLOWED.has(file)) {
      throw new NotFoundException();
    }
    try {
      return new StreamableFile(await readFile(path.join(assetDirectory(), file)));
    } catch {
      throw new NotFoundException();
    }
  }
}
