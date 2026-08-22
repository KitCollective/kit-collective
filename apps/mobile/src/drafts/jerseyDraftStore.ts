import {
  type JerseyCondition,
  type JerseySize,
  type KitType,
  PHOTO_ROLES,
  type PhotoRole,
  type PhotoSource,
} from "@kit/domain";
import { draftDb } from "./db";
import type { DraftPhoto, JerseyDraftRow } from "./types";

function mapRow(
  row: {
    id: string;
    club_id: string | null;
    club_label: string | null;
    season_id: string | null;
    kit_type: string;
    size: string;
    condition: string;
    active_role: string | null;
  },
  photos: DraftPhoto[],
): JerseyDraftRow {
  // SAFETY: jersey_draft columns are written only from domain enums in this module.
  const kitType = row.kit_type as KitType;
  const size = row.size as JerseySize;
  const condition = row.condition as JerseyCondition;
  const activeRole = (row.active_role as PhotoRole | null) ?? PHOTO_ROLES[0];

  return {
    id: row.id,
    clubId: row.club_id,
    clubLabel: row.club_label,
    seasonId: row.season_id,
    kitType,
    size,
    condition,
    activeRole,
    photos,
  };
}

export function createDraftId(): string {
  return globalThis.crypto.randomUUID();
}

export function createDraft(
  id: string,
  club?: { id: string; label: string } | null,
): JerseyDraftRow {
  const now = Date.now();
  draftDb.runSync(
    `INSERT INTO jersey_draft (id, club_id, club_label, kit_type, size, condition, active_role, updated_at)
     VALUES (?, ?, ?, 'home', 'm', 'used', 'front', ?)`,
    [id, club?.id ?? null, club?.label ?? null, now],
  );
  return loadDraft(id);
}

export function upsertDraftPhoto(
  draftId: string,
  role: PhotoRole,
  uri: string,
  source: PhotoSource,
): void {
  draftDb.runSync(
    `INSERT INTO jersey_draft_photo (draft_id, role, uri, source)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(draft_id, role) DO UPDATE SET uri = excluded.uri, source = excluded.source`,
    [draftId, role, uri, source],
  );
  draftDb.runSync(`UPDATE jersey_draft SET updated_at = ? WHERE id = ?`, [Date.now(), draftId]);
}

export function updateDraftFields(
  draftId: string,
  fields: {
    clubId?: string | null;
    clubLabel?: string | null;
    seasonId?: string | null;
    kitType?: KitType;
    size?: JerseySize;
    condition?: JerseyCondition;
  },
): void {
  const current = loadDraft(draftId);
  draftDb.runSync(
    `UPDATE jersey_draft
     SET club_id = ?, club_label = ?, season_id = ?, kit_type = ?, size = ?, condition = ?, updated_at = ?
     WHERE id = ?`,
    [
      fields.clubId !== undefined ? fields.clubId : current.clubId,
      fields.clubLabel !== undefined ? fields.clubLabel : current.clubLabel,
      fields.seasonId !== undefined ? fields.seasonId : current.seasonId,
      fields.kitType ?? current.kitType,
      fields.size ?? current.size,
      fields.condition ?? current.condition,
      Date.now(),
      draftId,
    ],
  );
}

export function loadDraft(id: string): JerseyDraftRow {
  const row = draftDb.getFirstSync<{
    id: string;
    club_id: string | null;
    club_label: string | null;
    season_id: string | null;
    kit_type: string;
    size: string;
    condition: string;
    active_role: string | null;
  }>(`SELECT * FROM jersey_draft WHERE id = ?`, [id]);

  if (!row) {
    throw new Error("Draft not found");
  }

  const photos = draftDb.getAllSync<{
    role: string;
    uri: string;
    source: string;
  }>(`SELECT role, uri, source FROM jersey_draft_photo WHERE draft_id = ?`, [id]);

  return mapRow(
    row,
    photos.map((photo) => {
      // SAFETY: jersey_draft_photo rows are written only via upsertDraftPhoto with domain enums.
      return {
        role: photo.role as PhotoRole,
        uri: photo.uri,
        source: photo.source as PhotoSource,
      };
    }),
  );
}

export function deleteDraft(id: string): void {
  draftDb.runSync(`DELETE FROM jersey_draft_photo WHERE draft_id = ?`, [id]);
  draftDb.runSync(`DELETE FROM jersey_draft WHERE id = ?`, [id]);
}

export function nextEmptyRole(photos: DraftPhoto[]): PhotoRole | null {
  const filled = new Set(photos.map((photo) => photo.role));
  return PHOTO_ROLES.find((role) => !filled.has(role)) ?? null;
}

export function draftExists(id: string): boolean {
  const row = draftDb.getFirstSync<{ id: string }>(`SELECT id FROM jersey_draft WHERE id = ?`, [
    id,
  ]);
  return row !== null;
}
