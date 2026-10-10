import {
  JERSEY_CONDITIONS,
  JERSEY_SIZES,
  type JerseyCondition,
  type JerseySize,
  KIT_TYPES,
  type KitType,
  PHOTO_ROLES,
  type PhotoRole,
  type PhotoSource,
} from "@kit/domain";
import { draftDb } from "@/drafts/db";
import { reloadCaptureSession } from "./captureSession";
import type {
  CaptureBranch,
  CaptureJerseyDraft,
  CaptureSavedDraft,
  CaptureSessionPhoto,
  CaptureSessionState,
  CaptureSessionStore,
} from "./captureSessionTypes";

type DraftRow = {
  id: string;
  session_id: string;
  club_id: string | null;
  club_label: string | null;
  national_team_id: string | null;
  national_team_label: string | null;
  season_id: string | null;
  kit_type: string | null;
  size: string | null;
  condition: string | null;
  kit_type_selected: number;
  size_selected: number;
  condition_selected: number;
  notes: string;
  player_name: string;
  player_id: string | null;
  player_number: string;
  season_label: string | null;
  badge_enabled: number;
  badge_id: string | null;
  badge_label: string | null;
  sort_order: number;
  needs_check: number | null;
};

type PhotoRow = {
  draft_id: string;
  uri: string;
  role: string | null;
  source: string;
  label: string | null;
  photo_id: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPhotoIdByUri(value: string | null | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function readSavedDraft(entry: unknown): CaptureSavedDraft | null {
  if (!isRecord(entry) || typeof entry.draftId !== "string") {
    return null;
  }
  return {
    draftId: entry.draftId,
    thumbUri: typeof entry.thumbUri === "string" ? entry.thumbUri : null,
    clubLabel: typeof entry.clubLabel === "string" ? entry.clubLabel : null,
    seasonLabel: typeof entry.seasonLabel === "string" ? entry.seasonLabel : null,
    kitType: readKitType(typeof entry.kitType === "string" ? entry.kitType : null),
  };
}

function readSavedDrafts(value: string | null | undefined): CaptureSavedDraft[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => readSavedDraft(entry))
      .filter((entry): entry is CaptureSavedDraft => entry !== null);
  } catch {
    return [];
  }
}

function readKitType(value: string | null): KitType | null {
  if (!value) {
    return null;
  }
  return KIT_TYPES.find((kitType) => kitType === value) ?? null;
}

function readJerseySize(value: string | null): JerseySize | null {
  if (!value) {
    return null;
  }
  return JERSEY_SIZES.find((size) => size === value) ?? null;
}

function readJerseyCondition(value: string | null): JerseyCondition | null {
  if (!value) {
    return null;
  }
  return JERSEY_CONDITIONS.find((condition) => condition === value) ?? null;
}

function readPhotoRole(value: string | null): PhotoRole | null {
  if (!value) {
    return null;
  }
  return PHOTO_ROLES.find((role) => role === value) ?? null;
}

function readBranch(value: string): CaptureBranch {
  return value === "bulk" ? "bulk" : "single";
}

function readOrderedUris(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error("Invalid ordered URIs payload");
  }
  return parsed;
}

function readPhotoSource(value: string | null | undefined): PhotoSource {
  if (value === "camera") {
    return "camera";
  }
  return "gallery";
}

function readDraft(row: DraftRow, photos: CaptureSessionPhoto[]): CaptureJerseyDraft {
  return {
    id: row.id,
    clubId: row.club_id,
    clubLabel: row.club_label,
    nationalTeamId: row.national_team_id ?? null,
    nationalTeamLabel: row.national_team_label ?? null,
    seasonId: row.season_id,
    kitType: readKitType(row.kit_type),
    size: readJerseySize(row.size),
    condition: readJerseyCondition(row.condition),
    kitTypeSelected: row.kit_type_selected === 1,
    sizeSelected: row.size_selected === 1,
    conditionSelected: row.condition_selected === 1,
    notes: row.notes ?? "",
    playerName: row.player_name ?? "",
    playerId: row.player_id ?? null,
    playerNumber: row.player_number ?? "",
    seasonLabel: row.season_label ?? null,
    badgeEnabled: row.badge_enabled === 1,
    badgeId: row.badge_id ?? null,
    badgeLabel: row.badge_label ?? null,
    photos,
    ...(row.needs_check === 1 ? { needsCheck: true } : {}),
  };
}

export function createSqliteCaptureSessionStore(sessionId: string): CaptureSessionStore {
  return {
    save(state) {
      draftDb.execSync("BEGIN");
      try {
        draftDb.runSync(`DELETE FROM capture_unbound_photo WHERE session_id = ?`, [sessionId]);
        draftDb.runSync(`DELETE FROM capture_session_draft_photo WHERE session_id = ?`, [
          sessionId,
        ]);
        draftDb.runSync(`DELETE FROM capture_session_draft WHERE session_id = ?`, [sessionId]);
        draftDb.runSync(
          `INSERT INTO capture_session (id, branch, active_draft_id, ordered_uris_json, photo_id_by_uri_json, overview, parked_at, grouping_settled_key, saved_drafts_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             branch = excluded.branch,
             active_draft_id = excluded.active_draft_id,
             ordered_uris_json = excluded.ordered_uris_json,
             photo_id_by_uri_json = excluded.photo_id_by_uri_json,
             overview = excluded.overview,
             parked_at = excluded.parked_at,
             grouping_settled_key = excluded.grouping_settled_key,
             saved_drafts_json = excluded.saved_drafts_json,
             updated_at = excluded.updated_at`,
          [
            sessionId,
            state.branch,
            state.activeDraftId,
            JSON.stringify(state.orderedUris),
            JSON.stringify(state.photoIdByUri ?? {}),
            state.overview ? 1 : 0,
            state.parkedAt ?? null,
            state.groupingSettledKey ?? null,
            state.savedDrafts && state.savedDrafts.length > 0
              ? JSON.stringify(state.savedDrafts)
              : null,
            Date.now(),
          ],
        );

        for (const [index, uri] of state.unboundUris.entries()) {
          draftDb.runSync(
            `INSERT INTO capture_unbound_photo (session_id, uri, photo_id, sort_order) VALUES (?, ?, ?, ?)`,
            [sessionId, uri, state.photoIdByUri?.[uri] ?? null, index],
          );
        }

        for (const [index, draft] of state.drafts.entries()) {
          draftDb.runSync(
            `INSERT INTO capture_session_draft (
               id, session_id, club_id, club_label, national_team_id, national_team_label,
               season_id, season_label,
               kit_type, size, condition,
               kit_type_selected, size_selected, condition_selected,
               notes, player_name, player_id, player_number,
               badge_enabled, badge_id, badge_label, sort_order, updated_at, needs_check
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              draft.id,
              sessionId,
              draft.clubId,
              draft.clubLabel,
              draft.nationalTeamId,
              draft.nationalTeamLabel,
              draft.seasonId,
              draft.seasonLabel,
              draft.kitType,
              draft.size,
              draft.condition,
              draft.kitTypeSelected ? 1 : 0,
              draft.sizeSelected ? 1 : 0,
              draft.conditionSelected ? 1 : 0,
              draft.notes,
              draft.playerName,
              draft.playerId,
              draft.playerNumber,
              draft.badgeEnabled ? 1 : 0,
              draft.badgeId,
              draft.badgeLabel,
              index,
              Date.now(),
              draft.needsCheck ? 1 : 0,
            ],
          );

          for (const photo of draft.photos) {
            draftDb.runSync(
              `INSERT INTO capture_session_draft_photo (session_id, draft_id, uri, role, source, label, photo_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                sessionId,
                draft.id,
                photo.uri,
                photo.role,
                photo.source,
                photo.label ?? null,
                photo.photoId ?? null,
              ],
            );
          }
        }

        draftDb.execSync("COMMIT");
      } catch (error) {
        draftDb.execSync("ROLLBACK");
        throw error;
      }
    },
    load() {
      const sessionRow = draftDb.getFirstSync<{
        id: string;
        branch: "single" | "bulk";
        active_draft_id: string;
        ordered_uris_json: string;
        photo_id_by_uri_json: string | null;
        overview: number | null;
        parked_at: number | null;
        grouping_settled_key: string | null;
        saved_drafts_json: string | null;
      }>(
        `SELECT id, branch, active_draft_id, ordered_uris_json, photo_id_by_uri_json, overview, parked_at, grouping_settled_key, saved_drafts_json FROM capture_session WHERE id = ?`,
        [sessionId],
      );

      if (!sessionRow) {
        return null;
      }

      const unboundRows = draftDb.getAllSync<{ uri: string; photo_id: string | null }>(
        `SELECT uri, photo_id FROM capture_unbound_photo WHERE session_id = ? ORDER BY sort_order ASC`,
        [sessionId],
      );

      const draftRows = draftDb.getAllSync<DraftRow>(
        `SELECT * FROM capture_session_draft WHERE session_id = ? ORDER BY sort_order ASC`,
        [sessionId],
      );

      const photoRows = draftDb.getAllSync<PhotoRow>(
        `SELECT draft_id, uri, role, source, label, photo_id FROM capture_session_draft_photo WHERE session_id = ?`,
        [sessionId],
      );

      const drafts = draftRows.map((row) => {
        const photos = photoRows
          .filter((photo) => photo.draft_id === row.id)
          .map((photo) => ({
            uri: photo.uri,
            role: readPhotoRole(photo.role),
            source: readPhotoSource(photo.source),
            ...(photo.photo_id ? { photoId: photo.photo_id } : {}),
            ...(photo.label ? { label: photo.label } : {}),
          }));
        return readDraft(row, photos);
      });

      const photoIdByUri = {
        ...readPhotoIdByUri(sessionRow.photo_id_by_uri_json),
        ...Object.fromEntries(
          unboundRows
            .filter(
              (row): row is { uri: string; photo_id: string } => typeof row.photo_id === "string",
            )
            .map((row) => [row.uri, row.photo_id]),
        ),
      };

      return {
        sessionId,
        branch: readBranch(sessionRow.branch),
        orderedUris: readOrderedUris(sessionRow.ordered_uris_json),
        unboundUris: unboundRows.map((row) => row.uri),
        photoIdByUri,
        drafts,
        activeDraftId: sessionRow.active_draft_id,
        ...(sessionRow.overview === 1 ? { overview: true } : {}),
        parkedAt: sessionRow.parked_at ?? null,
        ...(sessionRow.grouping_settled_key
          ? { groupingSettledKey: sessionRow.grouping_settled_key }
          : {}),
        savedDrafts: readSavedDrafts(sessionRow.saved_drafts_json),
      };
    },
    clear() {
      draftDb.runSync(`DELETE FROM capture_unbound_photo WHERE session_id = ?`, [sessionId]);
      draftDb.runSync(`DELETE FROM capture_session_draft_photo WHERE session_id = ?`, [sessionId]);
      draftDb.runSync(`DELETE FROM capture_session_draft WHERE session_id = ?`, [sessionId]);
      draftDb.runSync(`DELETE FROM capture_session WHERE id = ?`, [sessionId]);
    },
  };
}

export function reloadSqliteCaptureSession(sessionId: string): CaptureSessionState | null {
  return reloadCaptureSession(createSqliteCaptureSessionStore(sessionId));
}
