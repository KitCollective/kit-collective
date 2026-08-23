export type CompetitionHit = {
  name: string;
  slug: string;
  tmCode: string;
  countryName: string;
  iso3166?: string;
};

export type CompetitionIdentity = {
  leagueTransfermarktId: string;
  slug: string;
  name: string;
  countryName: string;
  iso3166: string;
  firstSeasonLabel?: string;
};

type CountryAlias = {
  iso3166: string;
  name: string;
  tokens: string[];
};

const COUNTRIES: CountryAlias[] = [
  { iso3166: "GB", name: "England", tokens: ["england", "english", "britain", "uk"] },
  { iso3166: "ES", name: "Spain", tokens: ["spain", "spanien", "spanish", "espanol"] },
  { iso3166: "TR", name: "Turkey", tokens: ["turkey", "tyrkiet", "turkish", "tyrkisk", "tyrkiske", "turkiye"] },
  { iso3166: "DK", name: "Denmark", tokens: ["denmark", "danmark", "danish", "dansk"] },
  { iso3166: "DE", name: "Germany", tokens: ["germany", "tyskland", "german", "tysk", "deutschland"] },
  { iso3166: "IT", name: "Italy", tokens: ["italy", "italien", "italian"] },
  { iso3166: "FR", name: "France", tokens: ["france", "frankrig", "french"] },
  { iso3166: "NL", name: "Netherlands", tokens: ["netherlands", "holland", "dutch"] },
  { iso3166: "PT", name: "Portugal", tokens: ["portugal", "portuguese"] },
  { iso3166: "BE", name: "Belgium", tokens: ["belgium", "belgien"] },
  { iso3166: "AT", name: "Austria", tokens: ["austria", "ostrig"] },
  { iso3166: "CH", name: "Switzerland", tokens: ["switzerland", "schweiz"] },
  { iso3166: "SE", name: "Sweden", tokens: ["sweden", "sverige", "swedish"] },
  { iso3166: "NO", name: "Norway", tokens: ["norway", "norge", "norwegian"] },
  { iso3166: "PL", name: "Poland", tokens: ["poland", "polen", "polish"] },
  { iso3166: "GR", name: "Greece", tokens: ["greece", "graekenland", "greek"] },
  { iso3166: "US", name: "United States", tokens: ["usa", "united states", "america"] },
  { iso3166: "BR", name: "Brazil", tokens: ["brazil", "brasilien"] },
  { iso3166: "AR", name: "Argentina", tokens: ["argentina"] },
  { iso3166: "JP", name: "Japan", tokens: ["japan"] },
  { iso3166: "SA", name: "Saudi Arabia", tokens: ["saudi"] },
  { iso3166: "UA", name: "Ukraine", tokens: ["ukraine"] },
  { iso3166: "CZ", name: "Czech Republic", tokens: ["czech", "tjekkiet"] },
  { iso3166: "HR", name: "Croatia", tokens: ["croatia", "kroatien"] },
  { iso3166: "RS", name: "Serbia", tokens: ["serbia", "serbien"] },
  { iso3166: "RO", name: "Romania", tokens: ["romania", "rumanien"] },
  { iso3166: "HU", name: "Hungary", tokens: ["hungary", "ungarn"] },
  { iso3166: "IE", name: "Ireland", tokens: ["ireland", "irland"] },
  { iso3166: "SCO", name: "Scotland", tokens: ["scotland", "skotland", "scottish"] },
];

const STOP_WORDS = new Set(["i", "in", "the", "den", "det", "en", "a", "and", "og", "for", "de"]);

export function foldCompetitionText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function normalizeCompetitionText(value: string): string {
  return foldCompetitionText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bla liga\b/g, "laliga")
    .replace(/\bsuper lig\b/g, "superliga")
    .replace(/\bsuper league\b/g, "superliga")
    .replace(/\bsuperligaen\b/g, "superliga")
    .trim()
    .replace(/\s+/g, " ");
}

export function iso3166ForCountryName(name: string): string | undefined {
  const folded = normalizeCompetitionText(name);
  if (!folded) {
    return undefined;
  }
  for (const country of COUNTRIES) {
    if (normalizeCompetitionText(country.name) === folded) {
      return country.iso3166;
    }
    if (country.tokens.some((token) => normalizeCompetitionText(token) === folded)) {
      return country.iso3166;
    }
  }
  return undefined;
}

function countryHint(query: string): CountryAlias | undefined {
  const folded = normalizeCompetitionText(query);
  const tokens = new Set(folded.split(" ").filter(Boolean));
  for (const country of COUNTRIES) {
    if (country.tokens.some((token) => tokens.has(token) || folded.includes(token))) {
      return country;
    }
  }
  return undefined;
}

function stripCountryAndStops(query: string): string {
  const hint = countryHint(query);
  const words = normalizeCompetitionText(query)
    .split(" ")
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word));
  const hintTokens = new Set(hint?.tokens ?? []);
  if (hint) {
    hintTokens.add(normalizeCompetitionText(hint.name));
  }
  return words.filter((word) => !hintTokens.has(word)).join(" ").trim();
}

function nameScore(query: string, hitName: string): number {
  const q = stripCountryAndStops(query);
  const n = normalizeCompetitionText(hitName);
  if (!q || !n) {
    return 0;
  }
  if (n === q) {
    return 100;
  }
  if (n.includes(q) || q.includes(n)) {
    return 80;
  }
  const qTokens = q.split(" ").filter(Boolean);
  const matched = qTokens.filter((token) => n.includes(token)).length;
  if (qTokens.length > 0 && matched === qTokens.length) {
    return 60;
  }
  if (matched > 0) {
    return 30;
  }
  return 0;
}

function hitMatchesCountry(hit: CompetitionHit, hint: CountryAlias): boolean {
  if (hit.iso3166 && hit.iso3166 === hint.iso3166) {
    return true;
  }
  const hitCountry = normalizeCompetitionText(hit.countryName);
  return (
    hitCountry === normalizeCompetitionText(hint.name) ||
    hint.tokens.some((token) => hitCountry.includes(token))
  );
}

function toIdentity(hit: CompetitionHit): CompetitionIdentity {
  return {
    leagueTransfermarktId: hit.tmCode,
    slug: hit.slug,
    name: hit.name,
    countryName: hit.countryName,
    iso3166: hit.iso3166 ?? iso3166ForCountryName(hit.countryName) ?? "XX",
  };
}

export function pickCompetitionHit(query: string, hits: CompetitionHit[]): CompetitionIdentity {
  if (hits.length === 0) {
    throw new Error(`No Transfermarkt competition matched: ${query}`);
  }

  const hint = countryHint(query);
  let pool = hits;
  if (hint) {
    const filtered = hits.filter((hit) => hitMatchesCountry(hit, hint));
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  const code = query.trim().toUpperCase();
  const byCode = pool.find((hit) => hit.tmCode === code);
  if (byCode) {
    return toIdentity(byCode);
  }

  const scored = pool
    .map((hit) => ({ hit, score: nameScore(query, hit.name) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const names = pool.map((hit) => `${hit.name} (${hit.countryName})`).join(", ");
    throw new Error(`No Transfermarkt competition matched: ${query}. Candidates: ${names}`);
  }

  const best = scored[0]!;
  const tied = scored.filter((row) => row.score === best.score);
  if (tied.length > 1) {
    const names = tied.map((row) => `${row.hit.name} (${row.hit.countryName})`).join(", ");
    throw new Error(`Ambiguous competition "${query}": ${names}`);
  }

  return toIdentity(best.hit);
}
