import { z } from "zod";
import { COLLECTOR_PHOTO_VARIANTS, RESERVED_PHOTO_VARIANTS } from "@kit/domain";

/** Query param on `GET /v1/collection/photos/{id}`. */
export const collectionPhotoVariantQuerySchema = z
  .enum([...COLLECTOR_PHOTO_VARIANTS, ...RESERVED_PHOTO_VARIANTS])
  .optional();

export type CollectionPhotoVariantQuery = z.infer<typeof collectionPhotoVariantQuerySchema>;

export const adminCollectorPhotoVariantQuerySchema = z
  .enum([...COLLECTOR_PHOTO_VARIANTS, ...RESERVED_PHOTO_VARIANTS])
  .optional();

export type AdminCollectorPhotoVariantQuery = z.infer<typeof adminCollectorPhotoVariantQuerySchema>;
