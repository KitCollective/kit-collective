import { z } from "zod";
import {
  collectionJerseyPhotoSchema,
  collectionJerseySchema,
} from "./save.js";

/** Collection list for the signed-in collector. */
export const collectionJerseysSchema = z
  .object({
    jerseys: z.array(collectionJerseySchema),
  })
  .strict();

export type CollectionJerseys = z.infer<typeof collectionJerseysSchema>;

export {
  collectionJerseyPhotoSchema,
  collectionJerseySchema,
  type CollectionJersey,
  type CollectionJerseyPhoto,
} from "./save.js";
