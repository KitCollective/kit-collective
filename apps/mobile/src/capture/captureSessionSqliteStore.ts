import {
  JERSEY_CONDITIONS,
  JERSEY_SIZES,
  type JerseyCondition,
  type JerseySize,
  KIT_TYPES,
  type KitType,
  PHOTO_ROLES,
  type PhotoRole,
} from "@kit/domain";
import { draftDb } from "@/drafts/db";
import type {
  CaptureBranch,
  CaptureJerseyDraft,
  CaptureSessionPhoto,
  CaptureSessionState,
  CaptureSessionStore,
} from "./captureSessionTypes";

type DraftRow = {
  id: string;
  session_id: string;
  club_id: string | null;
  club_label: string | null;
  season_id: string | null;
  kit_type: string | null;
  size: string | null;
  condition: string | null;
  kit_type_selected: number;
  size_selected: number;
  condition_selected: number;
  sort_order: number;
};

type PhotoRow = {
  draft_id: string;
  uri: string;
  role: string | null;
};

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

function readDraft(row: DraftRow, photos: CaptureSessionPhoto[]): CaptureJerseyDraft {
  return {
    id: row.id,
    clubId: row.club_id,
    clubLabel: row.club_label,
    seasonId: row.season_id,
    kitType: readKitType(row.kit_type),
    size: readJerseySize(row.size),
    condition: readJerseyCondition(row.condition),
    kitTypeSelected: row.kit_type_selected === 1,
    sizeSelected: row.size_selected === 1,
    conditionSelected: row.condition_selected === 1,
    photos,
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
          `INSERT INTO capture_session (id, branch, active_draft_id, ordered_uris_json, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             branch = excluded.branch,
             active_draft_id = excluded.active_draft_id,
             ordered_uris_json = excluded.ordered_uris_json,
             updated_at = excluded.updated_at`,
          [
            sessionId,
            state.branch,
            state.activeDraftId,
            JSON.stringify(state.orderedUris),
            Date.now(),
          ],
        );

        for (const [index, uri] of state.unboundUris.entries()) {
          draftDb.runSync(
            `INSERT INTO capture_unbound_photo (session_id, uri, sort_order) VALUES (?, ?, ?)`,
            [sessionId, uri, index],
          );
        }

        for (const [index, draft] of state.drafts.entries()) {
          draftDb.runSync(
            `INSERT INTO capture_session_draft (
               id, session_id, club_id, club_label, season_id,
               kit_type, size, condition,
               kit_type_selected, size_selected, condition_selected,
               sort_order, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              draft.id,
              sessionId,
              draft.clubId,
              draft.clubLabel,
              draft.seasonId,
              draft.kitType,
              draft.size,
              draft.condition,
              draft.kitTypeSelected ? 1 : 0,
              draft.sizeSelected ? 1 : 0,
              draft.conditionSelected ? 1 : 0,
              index,
              Date.now(),
            ],
          );

          for (const photo of draft.photos) {
            draftDb.runSync(
              `INSERT INTO capture_session_draft_photo (session_id, draft_id, uri, role)
               VALUES (?, ?, ?, ?)`,
              [sessionId, draft.id, photo.uri, photo.role],
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
      }>(
        `SELECT id, branch, active_draft_id, ordered_uris_json FROM capture_session WHERE id = ?`,
        [sessionId],
      );

      if (!sessionRow) {
        return null;
      }

      const unboundRows = draftDb.getAllSync<{ uri: string }>(
        `SELECT uri FROM capture_unbound_photo WHERE session_id = ? ORDER BY sort_order ASC`,
        [sessionId],
      );

      const draftRows = draftDb.getAllSync<DraftRow>(
        `SELECT * FROM capture_session_draft WHERE session_id = ? ORDER BY sort_order ASC`,
        [sessionId],
      );

      const photoRows = draftDb.getAllSync<PhotoRow>(
        `SELECT draft_id, uri, role FROM capture_session_draft_photo WHERE session_id = ?`,
        [sessionId],
      );

      const drafts = draftRows.map((row) => {
        const photos = photoRows
          .filter((photo) => photo.draft_id === row.id)
          .map((photo) => ({
            uri: photo.uri,
            role: readPhotoRole(photo.role),
          }));
        return readDraft(row, photos);
      });

      return {
        sessionId,
        branch: readBranch(sessionRow.branch),
        orderedUris: readOrderedUris(sessionRow.ordered_uris_json),
        unboundUris: unboundRows.map((row) => row.uri),
        drafts,
        activeDraftId: sessionRow.active_draft_id,
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
  return createSqliteCaptureSessionStore(sessionId).load();
}
