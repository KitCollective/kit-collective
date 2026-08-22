import { z } from "zod";

const PICKER_LABEL_LOCALES = ["da", "en", "sv", "no", "mul"] as const;

/** Catalog picker row — id and resolved label only (no archive URLs). */
export const catalogPickerItemSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
  })
  .strict();

export type CatalogPickerItem = z.infer<typeof catalogPickerItemSchema>;

export const catalogPickerSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1),
    locale: z.enum(PICKER_LABEL_LOCALES).default("da"),
  })
  .strict();

export type CatalogPickerSearchQuery = z.infer<typeof catalogPickerSearchQuerySchema>;

export const catalogClubSearchResponseSchema = z
  .object({
    clubs: z.array(catalogPickerItemSchema),
  })
  .strict();

export type CatalogClubSearchResponse = z.infer<typeof catalogClubSearchResponseSchema>;

export const catalogClubSeasonsQuerySchema = z
  .object({
    locale: z.enum(PICKER_LABEL_LOCALES).default("da"),
  })
  .strict();

export type CatalogClubSeasonsQuery = z.infer<typeof catalogClubSeasonsQuerySchema>;

export const catalogClubSeasonsResponseSchema = z
  .object({
    seasons: z.array(catalogPickerItemSchema),
  })
  .strict();

export type CatalogClubSeasonsResponse = z.infer<typeof catalogClubSeasonsResponseSchema>;
