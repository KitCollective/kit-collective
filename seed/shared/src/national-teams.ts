export type NationalTeamGender = "men" | "women";

export type NationalTeamDefinition = {
  /** Transfermarkt national side id (verein path). */
  transfermarktId: string;
  /** Football Kit Archive team id / slug for FKApi `/kits?nationalTeamFkApiId=`. */
  fkApiTeamId: string;
  gender: NationalTeamGender;
  slug?: string;
  name?: string;
  countryName?: string;
  iso3166?: string;
};

export type NationalTeamIdentity = {
  transfermarktId: string;
  slug: string;
  name: string;
  countryName: string;
  iso3166: string;
  gender: NationalTeamGender;
};

const DENMARK_MEN: NationalTeamDefinition = {
  transfermarktId: "3436",
  fkApiTeamId: "denmark-kits",
  gender: "men",
  slug: "daenemark",
  name: "Denmark",
  countryName: "Denmark",
  iso3166: "DK",
};

const NATIONAL_TEAMS: Record<string, NationalTeamDefinition> = {
  "3436": DENMARK_MEN,
  "denmark-men": DENMARK_MEN,
  "dk-men": DENMARK_MEN,
};

export function resolveNationalTeam(ref: string): NationalTeamDefinition | undefined {
  const key = ref.trim().toLowerCase();
  return NATIONAL_TEAMS[key];
}

export function catalogNationalTeamIdentity(ref: string): NationalTeamIdentity | undefined {
  const def = resolveNationalTeam(ref);
  if (!def) {
    return undefined;
  }

  return {
    transfermarktId: def.transfermarktId,
    slug: def.slug ?? "national-team",
    name: def.name ?? ref.trim(),
    countryName: def.countryName ?? "Denmark",
    iso3166: def.iso3166 ?? "DK",
    gender: def.gender,
  };
}
