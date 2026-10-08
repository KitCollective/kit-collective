import { PHOTO_ROLES, type PhotoRole } from "@kit/domain";

export const EMPTY_SLOT_URIS: Record<PhotoRole, string | undefined> = {
  front: undefined,
  back: undefined,
  left: undefined,
  right: undefined,
  other: undefined,
};

/**
 * During grouping, only occupied slots exist. The empty wait is a same-size
 * canvas with a central hop — not a gray Forside frame.
 */
export function groupingViewerRoles(
  slotUris: Record<PhotoRole, string | undefined>,
  analyzing: boolean,
): PhotoRole[] {
  if (!analyzing) {
    return [...PHOTO_ROLES];
  }

  return PHOTO_ROLES.filter((role) => Boolean(slotUris[role]));
}

export function isGroupingWait(
  slotUris: Record<PhotoRole, string | undefined>,
  analyzing: boolean,
): boolean {
  return analyzing && groupingViewerRoles(slotUris, true).length === 0;
}

/**
 * Grouping strip is only the rolling uris. Bound thumbnails must not leak
 * extra roles — that remounts the whole row and unfolds every slot at once.
 */
export function groupingStripUris(rollingUris: string[]): Record<PhotoRole, string | undefined> {
  const next = { ...EMPTY_SLOT_URIS };
  for (const [index, uri] of rollingUris.entries()) {
    const role = PHOTO_ROLES[index];
    if (role) {
      next[role] = uri;
    }
  }
  return next;
}
