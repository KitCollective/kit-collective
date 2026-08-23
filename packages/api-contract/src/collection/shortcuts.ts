import { z } from "zod";

const facetUuid = z.string().uuid();

/** One collection genvej owned by the signed-in collector. */
export const collectionShortcutSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    sortOrder: z.number().int(),
    clubId: z.string().uuid().nullable(),
    clubLabel: z.string().min(1).nullable(),
    matchCount: z.number().int().nonnegative(),
  })
  .strict();

export type CollectionShortcut = z.infer<typeof collectionShortcutSchema>;

export const collectionShortcutsSchema = z
  .object({
    shortcuts: z.array(collectionShortcutSchema),
  })
  .strict();

export type CollectionShortcuts = z.infer<typeof collectionShortcutsSchema>;

export const collectionShortcutWriteSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    clubId: facetUuid,
    sortOrder: z.number().int().optional(),
  })
  .strict();

export type CollectionShortcutWrite = z.infer<typeof collectionShortcutWriteSchema>;

export const collectionShortcutIdParamSchema = z
  .object({
    shortcutId: z.string().uuid(),
  })
  .strict();

export type CollectionShortcutIdParam = z.infer<typeof collectionShortcutIdParamSchema>;

export const collectionJerseysQuerySchema = z
  .object({
    shortcutId: z.string().uuid().optional(),
  })
  .strict();

export type CollectionJerseysQuery = z.infer<typeof collectionJerseysQuerySchema>;
