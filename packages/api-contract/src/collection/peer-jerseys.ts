import { z } from "zod";
import { collectionDiscoverJerseySchema } from "./bidding.js";

export const collectionPeerJerseysSchema = z
  .object({
    jerseys: z.array(collectionDiscoverJerseySchema),
  })
  .strict();

export type CollectionPeerJerseys = z.infer<typeof collectionPeerJerseysSchema>;
