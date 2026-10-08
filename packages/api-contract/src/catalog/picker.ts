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
    meta: z.string().min(1).optional(),
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

/** Club/NT picker may open with an empty query and list a capped live page. */
export const catalogClubSearchQuerySchema = z
  .object({
    q: z.string().trim().optional().default(""),
    locale: z.enum(PICKER_LABEL_LOCALES).default("da"),
  })
  .strict();

export type CatalogClubSearchQuery = z.infer<typeof catalogClubSearchQuerySchema>;

/** Player search: `q` is required unless the query is scoped to a club. */
export const catalogPlayerSearchQuerySchema = z
  .object({
    q: z.string().trim().optional().default(""),
    locale: z.enum(PICKER_LABEL_LOCALES).default("da"),
    clubId: z.string().uuid().optional(),
    seasonId: z.string().uuid().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.clubId) || data.q.length >= 1, {
    message: "Query required unless clubId is set",
    path: ["q"],
  })
  .refine((data) => !data.seasonId || Boolean(data.clubId), {
    message: "seasonId requires clubId",
    path: ["seasonId"],
  });

export type CatalogPlayerSearchQuery = z.infer<typeof catalogPlayerSearchQuerySchema>;

export const catalogPickerClubIdParamSchema = z
  .object({
    clubId: z.string().uuid(),
  })
  .strict();

export type CatalogPickerClubIdParam = z.infer<typeof catalogPickerClubIdParamSchema>;

export const catalogPickerSeasonIdParamSchema = z
  .object({
    seasonId: z.string().uuid(),
  })
  .strict();

export type CatalogPickerSeasonIdParam = z.infer<typeof catalogPickerSeasonIdParamSchema>;

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
