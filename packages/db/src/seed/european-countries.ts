import { EUROPEAN_COUNTRIES, type EuropeanCountry } from "@kit/domain";
import { and, eq } from "drizzle-orm";
import type { Db } from "../migrate.js";
import { catalogLabel, country } from "../schema/index.js";

type SeedLabel = {
  locale: "da" | "en";
  kind: "label" | "alias";
  text: string;
};

function labelsFor(entry: EuropeanCountry): SeedLabel[] {
  const labels: SeedLabel[] = [
    { locale: "da", kind: "label", text: entry.labelDa },
    { locale: "en", kind: "label", text: entry.labelEn },
  ];
  const seen = new Set(
    labels.map((label) => `${label.locale}:${label.kind}:${label.text.toLowerCase()}`),
  );
  for (const alias of entry.aliases ?? []) {
    for (const locale of ["da", "en"] as const) {
      const key = `${locale}:alias:${alias.toLowerCase()}`;
      const labelKey = `${locale}:label:${alias.toLowerCase()}`;
      if (seen.has(key) || seen.has(labelKey)) {
        continue;
      }
      labels.push({ locale, kind: "alias", text: alias });
      seen.add(key);
    }
  }
  return labels;
}

function countryCodes(entry: EuropeanCountry) {
  return {
    iso3166Alpha3: entry.iso3166Alpha3,
    iso3166Numeric: entry.iso3166Numeric,
    iso3166Reserved: entry.iso3166Reserved,
    fifa: entry.fifa,
    ioc: entry.ioc,
  };
}

async function upsertCountryRow(db: Db, entry: EuropeanCountry): Promise<string> {
  const existing = await db
    .select({ id: country.id })
    .from(country)
    .where(eq(country.iso3166, entry.iso3166))
    .limit(1);

  if (existing[0]) {
    await db.update(country).set(countryCodes(entry)).where(eq(country.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db
    .insert(country)
    .values({
      iso3166: entry.iso3166,
      ...countryCodes(entry),
    })
    .returning({ id: country.id });
  // SAFETY: insert … returning always yields the created country row.
  return row!.id;
}

async function upsertCountryLabel(
  db: Db,
  entityId: string,
  locale: SeedLabel["locale"],
  kind: SeedLabel["kind"],
  text: string,
): Promise<void> {
  const filters = [
    eq(catalogLabel.entityType, "country"),
    eq(catalogLabel.entityId, entityId),
    eq(catalogLabel.locale, locale),
    eq(catalogLabel.kind, kind),
  ];
  if (kind === "alias") {
    filters.push(eq(catalogLabel.text, text));
  }

  const existing = await db
    .select({ id: catalogLabel.id, text: catalogLabel.text, source: catalogLabel.source })
    .from(catalogLabel)
    .where(and(...filters))
    .limit(1);

  if (kind === "alias") {
    if (existing[0]) {
      return;
    }
    await db.insert(catalogLabel).values({
      entityType: "country",
      entityId,
      locale,
      kind: "alias",
      text,
      source: "seed",
    });
    return;
  }

  if (existing[0]) {
    if (existing[0].source === "admin" || existing[0].text === text) {
      return;
    }
    await db.update(catalogLabel).set({ text }).where(eq(catalogLabel.id, existing[0].id));
    return;
  }

  await db.insert(catalogLabel).values({
    entityType: "country",
    entityId,
    locale,
    kind: "label",
    text,
    source: "seed",
  });
}

export async function seedEuropeanCountries(db: Db): Promise<{ countries: number }> {
  for (const entry of EUROPEAN_COUNTRIES) {
    const id = await upsertCountryRow(db, entry);
    for (const label of labelsFor(entry)) {
      await upsertCountryLabel(db, id, label.locale, label.kind, label.text);
    }
  }
  return { countries: EUROPEAN_COUNTRIES.length };
}
