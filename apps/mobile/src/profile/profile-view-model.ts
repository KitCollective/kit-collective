import type { Entitlement } from "@kit/api-contract";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ProfileHomeRow = {
  key: "favorites" | "plus";
  label: string;
  value: string;
  accessibilityLabel: string;
};

/** The KitCollective+ row's value, worked out from the Entitlement. */
export function plusStatusText(entitlement: Entitlement | null, now: Date): string {
  if (!entitlement) {
    return "Ikke aktiv";
  }

  if (entitlement.live) {
    if (entitlement.source !== "trial") {
      return "Aktiv";
    }
    const msLeft = entitlement.expires
      ? new Date(entitlement.expires).getTime() - now.getTime()
      : 0;
    const days = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));
    return `Prøve · ${days} ${days === 1 ? "dag" : "dage"} tilbage`;
  }

  const hadPlus =
    entitlement.trialUsed || entitlement.source !== null || entitlement.expires !== null;
  return hadPlus ? "Udløbet" : "Ikke aktiv";
}

type IdentityCaptionInput = {
  city: string | null;
  countryLabel: string | null;
  showCity: boolean;
  jerseyCount: number;
};

/** The line under the Handle: the city (or the country when Vis by is off), then the jersey count. */
export function identityCaption({
  city,
  countryLabel,
  showCity,
  jerseyCount,
}: IdentityCaptionInput): string {
  const location = showCity && city ? city : countryLabel;
  const count = jerseyCount === 1 ? "1 trøje" : `${jerseyCount} trøjer`;
  return [location, count].filter(Boolean).join(" · ");
}

type ProfileHomeRowsInput = {
  favoriteCount: number;
  entitlement: Entitlement | null;
  now: Date;
};

/** The two rows of Profil home. Indstillinger is a header button; nothing else is added. */
export function profileHomeRows({
  favoriteCount,
  entitlement,
  now,
}: ProfileHomeRowsInput): ProfileHomeRow[] {
  return [
    homeRow("favorites", "Favoritter", String(favoriteCount)),
    homeRow("plus", "KitCollective+", plusStatusText(entitlement, now)),
  ];
}

function homeRow(key: ProfileHomeRow["key"], label: string, value: string): ProfileHomeRow {
  return { key, label, value, accessibilityLabel: `${label}, ${value}` };
}
