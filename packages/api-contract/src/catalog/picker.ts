import { z } from "zod";
import { catalogSideKindSchema } from "./side.js";

export { type CatalogSideKind, catalogSideKindSchema } from "./side.js";

const PICKER_LABEL_LOCALES = ["da", "en", "sv", "no", "mul"] as const;

/** Catalog picker row — id and resolved label only (no archive URLs). */
export const catalogPickerItemSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    kind: catalogSideKindSchema.optional(),
  })
  .strict();

export type CatalogPickerItem = z.infer<typeof catalogPickerItemSchema>;

export const catalogSidePickerItemSchema = catalogPickerItemSchema
  .extend({
    kind: catalogSideKindSchema,
  })
  .strict();

export type CatalogSidePickerItem = z.infer<typeof catalogSidePickerItemSchema>;

export const catalogPickerSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1),
    locale: z.enum(PICKER_LABEL_LOCALES).default("da"),
  })
  .strict();

export type CatalogPickerSearchQuery = z.infer<typeof catalogPickerSearchQuerySchema>;

export const catalogPickerClubIdParamSchema = z
  .object({
    clubId: z.string().uuid(),
  })
  .strict();

export type CatalogPickerClubIdParam = z.infer<typeof catalogPickerClubIdParamSchema>;

export const catalogClubSearchResponseSchema = z
  .object({
    clubs: z.array(catalogSidePickerItemSchema),
  })
  .strict();

export type CatalogClubSearchResponse = z.infer<typeof catalogClubSearchResponseSchema>;

export const catalogClubSeasonsResponseSchema = z
  .object({
    seasons: z.array(catalogPickerItemSchema),
  })
  .strict();

export type CatalogClubSeasonsResponse = z.infer<typeof catalogClubSeasonsResponseSchema>;

export const catalogFacetSearchResponseSchema = z
  .object({
    items: z.array(catalogPickerItemSchema),
  })
  .strict();

export type CatalogFacetSearchResponse = z.infer<typeof catalogFacetSearchResponseSchema>;
