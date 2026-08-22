import { z } from "zod";

/** Empty collection list for the signed-in collector shell. */
export const collectionJerseysSchema = z
  .object({
    jerseys: z.array(z.never()),
  })
  .strict();

export type CollectionJerseys = z.infer<typeof collectionJerseysSchema>;
