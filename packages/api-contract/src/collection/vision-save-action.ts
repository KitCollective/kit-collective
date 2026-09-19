import type { KitType } from "@kit/domain";
import type { VisionJobStatus, VisionSuggestions, VisionUserAction } from "./vision.js";

export type VisionSaveActionInput = {
  status: VisionJobStatus;
  suggestions?: VisionSuggestions;
  selectedClubId?: string;
  selectedNationalTeamId?: string;
  selectedSeasonId: string;
  selectedKitType: KitType;
};

export type VisionSaveActionResult = {
  action: VisionUserAction;
  clubId?: string;
  nationalTeamId?: string;
  seasonId?: string;
  type?: KitType;
};

/**
 * Resolves the VisionLog userAction to record when the collector saves.
 * Every job status must yield an action — never leave userAction null at Save.
 */
export function resolveVisionSaveAction(input: VisionSaveActionInput): VisionSaveActionResult {
  const {
    status,
    suggestions,
    selectedClubId,
    selectedNationalTeamId,
    selectedSeasonId,
    selectedKitType,
  } = input;

  if (status === "pending" || status === "failed" || status === "noop") {
    return { action: "ignored" };
  }

  if (status === "ready") {
    if (!suggestions) {
      return { action: "ignored" };
    }

    const matchesClub =
      selectedClubId != null &&
      suggestions.clubId === selectedClubId &&
      suggestions.nationalTeamId == null;
    const matchesNationalTeam =
      selectedNationalTeamId != null && suggestions.nationalTeamId === selectedNationalTeamId;
    const matchesSide = matchesClub || matchesNationalTeam;
    const matchesSeason = suggestions.seasonId === selectedSeasonId;
    const matchesType = !suggestions.type || suggestions.type === selectedKitType;
    const fullyMatches = matchesSide && matchesSeason && matchesType;

    if (fullyMatches) {
      return {
        action: "accepted",
        ...(selectedClubId ? { clubId: selectedClubId } : {}),
        ...(selectedNationalTeamId ? { nationalTeamId: selectedNationalTeamId } : {}),
        seasonId: selectedSeasonId,
        type: selectedKitType,
      };
    }

    if (
      matchesSide ||
      matchesSeason ||
      (suggestions.type && suggestions.type === selectedKitType)
    ) {
      return {
        action: "edited",
        ...(selectedClubId ? { clubId: selectedClubId } : {}),
        ...(selectedNationalTeamId ? { nationalTeamId: selectedNationalTeamId } : {}),
        seasonId: selectedSeasonId,
        type: selectedKitType,
      };
    }

    return { action: "ignored" };
  }

  const _exhaustive: never = status;
  return _exhaustive;
}
