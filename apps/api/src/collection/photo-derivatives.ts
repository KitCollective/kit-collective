import {
  lightboxMaxEdgeForRole,
  lightboxObjectKey,
  originalObjectKey,
  photoPrefix,
  stripObjectKey,
  STRIP_VARIANT_WIDTH,
  variantObjectKey,
} from "@kit/domain";
import type { PhotoRole } from "@kit/domain";
import sharp from "sharp";
import type { ObjectStoreAdapter } from "./object-store.js";

const STRIP_ASPECT_HEIGHT = 5;
const STRIP_ASPECT_WIDTH = 4;

export type PhotoDerivativeJob = {
  userId: string;
  jerseyId: string;
  photoId: string;
  role: PhotoRole;
  sourceObjectKey: string;
};

export function derivativeKeysForPhoto(
  userId: string,
  jerseyId: string,
  photoId: string,
): {
  prefix: string;
  grid: string;
  strip: string;
  lightbox: string;
  original: string;
} {
  const prefix = photoPrefix(userId, jerseyId, photoId);
  return {
    prefix,
    grid: variantObjectKey(prefix, "grid"),
    strip: stripObjectKey(prefix),
    lightbox: lightboxObjectKey(prefix),
    original: originalObjectKey(prefix),
  };
}

/** Auto-orient, strip EXIF/GPS, and store as JPEG without metadata. */
export async function storeGpsStrippedOriginal(
  objectStore: ObjectStoreAdapter,
  objectKey: string,
  bytes: Uint8Array,
): Promise<void> {
  const stripped = await sharp(Buffer.from(bytes))
    .rotate()
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  await objectStore.putObject(objectKey, Uint8Array.from(stripped));
}

/** 4:5 center crop for Confirm strip tiles. */
export async function renderStripVariant(bytes: Uint8Array): Promise<Uint8Array> {
  const input = sharp(Buffer.from(bytes)).rotate();
  const metadata = await input.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error("Cannot render strip variant without image dimensions");
  }

  const targetRatio = STRIP_ASPECT_WIDTH / STRIP_ASPECT_HEIGHT;
  const sourceRatio = width / height;
  let cropWidth = width;
  let cropHeight = height;
  if (sourceRatio > targetRatio) {
    cropWidth = Math.round(height * targetRatio);
  } else {
    cropHeight = Math.round(width / targetRatio);
  }
  const left = Math.max(0, Math.round((width - cropWidth) / 2));
  const top = Math.max(0, Math.round((height - cropHeight) / 2));

  const output = await input
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(STRIP_VARIANT_WIDTH, Math.round((STRIP_VARIANT_WIDTH * STRIP_ASPECT_HEIGHT) / STRIP_ASPECT_WIDTH))
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return Uint8Array.from(output);
}

/** Uncropped resize for Photo lightbox — larger long edge than grid tiles. */
export async function renderLightboxVariant(bytes: Uint8Array, role: PhotoRole): Promise<Uint8Array> {
  const maxLongEdge = lightboxMaxEdgeForRole(role);
  const input = sharp(Buffer.from(bytes)).rotate();
  const metadata = await input.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error("Cannot render lightbox variant without image dimensions");
  }

  const longEdge = Math.max(width, height);
  const pipeline =
    longEdge <= maxLongEdge
      ? input
      : width >= height
        ? input.resize({ width: maxLongEdge })
        : input.resize({ height: maxLongEdge });

  const output = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return Uint8Array.from(output);
}

export async function writeStripAndLightboxVariants(
  objectStore: ObjectStoreAdapter,
  job: PhotoDerivativeJob,
  sourceBytes?: Uint8Array,
): Promise<void> {
  const bytes = sourceBytes ?? (await objectStore.getObject(job.sourceObjectKey));
  if (!bytes) {
    return;
  }
  const keys = derivativeKeysForPhoto(job.userId, job.jerseyId, job.photoId);
  const [stripBytes, lightboxBytes] = await Promise.all([
    renderStripVariant(bytes),
    renderLightboxVariant(bytes, job.role),
  ]);
  await objectStore.putObject(keys.strip, stripBytes);
  await objectStore.putObject(keys.lightbox, lightboxBytes);
}

export async function processPhotoDerivativeJob(
  objectStore: ObjectStoreAdapter,
  job: PhotoDerivativeJob,
): Promise<void> {
  await writeStripAndLightboxVariants(objectStore, job);
}
