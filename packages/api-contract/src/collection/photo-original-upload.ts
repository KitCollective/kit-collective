import { z } from "zod";

/** Body for `PUT /v1/collection/photos/{id}/original` — not part of Save JSON. */
export const collectionPhotoOriginalUploadSchema = z
  .object({
    contentBase64: z.string().min(1),
  })
  .strict();

export type CollectionPhotoOriginalUpload = z.infer<typeof collectionPhotoOriginalUploadSchema>;
