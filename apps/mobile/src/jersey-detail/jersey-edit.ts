import type { CollectionJersey, CollectionJerseyUpdate } from "@kit/api-contract";
import type { JerseyCondition, JerseySize, KitType } from "@kit/domain";
import { JERSEY_CONDITION_LABELS_DA, JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";
import { jerseyTitle } from "@/jersey-detail/jersey-detail-view-model";

/**
 * The pure edit rules of an own UserJersey (docs/design-system.md -> Own UserJersey detail).
 * One fact changes at a time; the API replaces the whole row, so every edit returns the *full*
 * update body: a body that leaves out patchIds or catalogKitId would clear the badge or the kit.
 * No React here; the screen only applies what this module decides.
 */

type Named = { id: string; label: string };

export type ResetKey = "player" | "badge" | "season";

export type JerseyEdit =
  | { kind: "type"; value: KitType }
  | { kind: "size"; value: JerseySize }
  | { kind: "condition"; value: JerseyCondition }
  | { kind: "badge"; patch: Named | null }
  | { kind: "player"; player: (Named & { number: string }) | null }
  | {
      kind: "season";
      season: Named;
      /** The new season's squad for the jersey's side: the player stays only if he is in it. */
      squad: readonly Named[];
      /** The new season's patches: the badge stays only if it is among them. */
      patches: readonly Named[];
    }
  | {
      kind: "club";
      club: Named;
      /** The new club's seasons. The current season stays when it is one of them. */
      seasons: readonly Named[];
      /** Set once the collector has picked a season because the new club lacks the current one. */
      chosenSeason?: Named;
      /** Patches of the season the jersey ends up in. */
      patches: readonly Named[];
    };

export type JerseyEditOutcome =
  | {
      status: "ok";
      /** The full update to send. */
      body: CollectionJerseyUpdate;
      /** What the screen shows at once, before the server answers. */
      optimistic: CollectionJersey;
      reset: ResetKey[];
    }
  /** The new club lacks the jersey's season: ask for one before anything is saved. */
  | { status: "choose-season"; reset: ResetKey[] };

function patchesOf(jersey: CollectionJersey): Named[] {
  return jersey.patches ?? [];
}

/** The full update for `jersey` as it stands; edits override the parts they change. */
function fullBody(jersey: CollectionJersey): CollectionJerseyUpdate {
  return {
    ...(jersey.clubId ? { clubId: jersey.clubId } : { nationalTeamId: jersey.nationalTeamId }),
    seasonId: jersey.seasonId,
    catalogKitId: jersey.catalogKitId,
    type: jersey.type,
    size: jersey.size,
    condition: jersey.condition,
    playerId: jersey.playerId ?? null,
    patchIds: patchesOf(jersey).map((patch) => patch.id),
  } as CollectionJerseyUpdate;
}

function done(optimistic: CollectionJersey, reset: ResetKey[]): JerseyEditOutcome {
  return { status: "ok", body: fullBody(optimistic), optimistic, reset };
}

function withoutPlayer(jersey: CollectionJersey): CollectionJersey {
  return { ...jersey, playerId: null, playerLabel: null, playerNumber: null };
}

function hasPlayer(jersey: CollectionJersey): boolean {
  return Boolean(jersey.playerId);
}

function hasBadge(jersey: CollectionJersey): boolean {
  return patchesOf(jersey).length > 0;
}

/** Keep the badge only when the target season offers it. */
function keepBadgeIn(
  jersey: CollectionJersey,
  seasonPatches: readonly Named[],
): { jersey: CollectionJersey; dropped: boolean } {
  const current = patchesOf(jersey);
  const kept = current.filter((patch) => seasonPatches.some((other) => other.id === patch.id));
  return {
    jersey: { ...jersey, patches: kept },
    dropped: current.length > 0 && kept.length === 0,
  };
}

export function applyJerseyEdit(jersey: CollectionJersey, edit: JerseyEdit): JerseyEditOutcome {
  switch (edit.kind) {
    case "size":
      return done({ ...jersey, size: edit.value }, []);
    case "condition":
      return done({ ...jersey, condition: edit.value }, []);
    case "type":
      // A kit is per type: a different type no longer points at the old kit.
      return done(
        {
          ...jersey,
          type: edit.value,
          catalogKitId: edit.value === jersey.type ? jersey.catalogKitId : null,
        },
        [],
      );
    case "badge":
      return done({ ...jersey, patches: edit.patch ? [edit.patch] : [] }, []);
    case "player":
      return done(
        edit.player
          ? {
              ...jersey,
              playerId: edit.player.id,
              playerLabel: edit.player.label,
              playerNumber: edit.player.number.trim() === "" ? null : edit.player.number,
            }
          : withoutPlayer(jersey),
        [],
      );
    case "season": {
      const reset: ResetKey[] = [];
      let next: CollectionJersey = {
        ...jersey,
        seasonId: edit.season.id,
        seasonLabel: edit.season.label,
        squadPlayers: [...edit.squad],
        catalogKitId: edit.season.id === jersey.seasonId ? jersey.catalogKitId : null,
      };
      if (hasPlayer(jersey) && !edit.squad.some((player) => player.id === jersey.playerId)) {
        next = withoutPlayer(next);
        reset.push("player");
      }
      const badge = keepBadgeIn(next, edit.patches);
      next = badge.jersey;
      if (badge.dropped) {
        reset.push("badge");
      }
      return done(next, reset);
    }
    case "club": {
      const keepsSeason = edit.seasons.some((season) => season.id === jersey.seasonId);
      const season = edit.chosenSeason ?? (keepsSeason ? null : undefined);
      const reset: ResetKey[] = [];
      if (hasPlayer(jersey)) {
        reset.push("player");
      }
      if (season === undefined) {
        reset.push("season");
        if (hasBadge(jersey)) {
          reset.push("badge");
        }
        return { status: "choose-season", reset };
      }

      let next: CollectionJersey = {
        ...withoutPlayer(jersey),
        clubId: edit.club.id,
        clubLabel: edit.club.label,
        nationalTeamId: null,
        nationalTeamLabel: null,
        // The squad belongs to club + season; the server answer brings the new one.
        squadPlayers: [],
        catalogKitId: null,
      };
      if (season !== null) {
        next = { ...next, seasonId: season.id, seasonLabel: season.label };
        reset.push("season");
      }
      const badge = keepBadgeIn(next, edit.patches);
      next = badge.jersey;
      if (badge.dropped) {
        reset.push("badge");
      }
      return done(next, reset);
    }
    default: {
      const _exhaustive: never = edit;
      return _exhaustive;
    }
  }
}

export type ClubChangeCopy = {
  title: string;
  keptHeading: string;
  kept: string[];
  resetHeading: string;
  reset: string[];
  confirmLabel: string;
  keepLabel: string;
  accessibilityLabel: string;
};

const RESET_LABELS: Record<ResetKey, string> = {
  player: "Spiller",
  season: "Sæson",
  badge: "Badge",
};

/**
 * The confirm sheet when the club changes: what carries over and what is reset. Nothing is
 * saved before the primary is tapped.
 */
export function clubChangeCopy(
  jersey: CollectionJersey,
  newClubLabel: string,
  reset: readonly ResetKey[],
): ClubChangeCopy {
  const kept: string[] = [];
  if (!reset.includes("season")) {
    kept.push(`Sæson ${jersey.seasonLabel}`);
  }
  kept.push("Type", "Størrelse", "Stand");
  if (hasBadge(jersey) && !reset.includes("badge")) {
    kept.push("Badge");
  }

  const resetLabels = (["player", "season", "badge"] as const)
    .filter((key) => reset.includes(key))
    .map((key) => RESET_LABELS[key]);

  const title = "Skift klub?";
  const confirmLabel = `Skift til ${newClubLabel}`;
  const keepLabel = `Behold ${jerseyTitle(jersey)}`;
  return {
    title,
    keptHeading: "Beholdes",
    kept,
    resetHeading: "Nulstilles",
    reset: resetLabels,
    confirmLabel,
    keepLabel,
    accessibilityLabel: `${title} Beholdes: ${kept.join(", ")}. Nulstilles: ${
      resetLabels.length > 0 ? resetLabels.join(", ") : "intet"
    }.`,
  };
}

/** The danger toast when a save fails and the old value is put back (copy is provisional). */
export const JERSEY_EDIT_FAILURE_MESSAGE = "Ændringen blev ikke gemt.";

export type JerseyFactKey = "type" | "size" | "condition" | "badge";

export type JerseyFactSheetCopy = {
  title: string;
  /** "Type, nuværende Hjemme": the sheet announces the fact and its current value. */
  accessibilityLabel: string;
  current: string;
};

const FACT_TITLES: Record<JerseyFactKey, string> = {
  type: "Type",
  size: "Størrelse",
  condition: "Stand",
  badge: "Badge",
};

const NO_BADGE_LABEL = "Ingen";

export function jerseyFactCurrentValue(key: JerseyFactKey, jersey: CollectionJersey): string {
  switch (key) {
    case "type":
      return KIT_TYPE_LABELS_DA[jersey.type];
    case "size":
      return JERSEY_SIZE_LABELS_DA[jersey.size];
    case "condition":
      return JERSEY_CONDITION_LABELS_DA[jersey.condition];
    case "badge":
      return patchesOf(jersey)[0]?.label ?? NO_BADGE_LABEL;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function jerseyFactSheetCopy(
  key: JerseyFactKey,
  jersey: CollectionJersey,
): JerseyFactSheetCopy {
  const current = jerseyFactCurrentValue(key, jersey);
  return {
    title: FACT_TITLES[key],
    accessibilityLabel: `${FACT_TITLES[key]}, nuværende ${current}`,
    current,
  };
}

export { NO_BADGE_LABEL };

/** First four-digit year in a season label ("2023/24" -> 2023), or null. */
function seasonYear(label: string): number | null {
  const match = label.match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : null;
}

/** Newest first by starting year; a label with no year goes last. */
export function sortSeasonsNewestFirst<T extends Named>(seasons: readonly T[]): T[] {
  return [...seasons].sort((left, right) => {
    const leftYear = seasonYear(left.label);
    const rightYear = seasonYear(right.label);
    if (leftYear === rightYear) {
      return 0;
    }
    if (leftYear === null) {
      return 1;
    }
    if (rightYear === null) {
      return -1;
    }
    return rightYear - leftYear;
  });
}

export type SeasonDecade = { label: string; firstSeasonId: string };

/** One chip per decade present, newest first, each jumping to its first (newest) season. */
export function seasonDecades(sortedNewestFirst: readonly Named[]): SeasonDecade[] {
  const decades: SeasonDecade[] = [];
  const seen = new Set<number>();
  for (const season of sortedNewestFirst) {
    const year = seasonYear(season.label);
    if (year === null) {
      continue;
    }
    const decade = Math.floor(year / 10) * 10;
    if (seen.has(decade)) {
      continue;
    }
    seen.add(decade);
    decades.push({ label: `${decade}'erne`, firstSeasonId: season.id });
  }
  return decades;
}
