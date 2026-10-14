import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLES } from "@kit/domain";
import { resolvePhotoUrl } from "@/api/collection";
import { readPreparedPhotoUri } from "@/capture/photoBytes";

function isServerPhotoUri(uri: string): boolean {
  return uri.startsWith("http") || uri.includes("/v1/collection/photos/");
}

/** Confirm hub strip — local prepared 4:5 or server `variant=strip`. */
export async function resolveConfirmStripUri(uri: string, role: PhotoRole): Promise<string> {
  if (isServerPhotoUri(uri)) {
    return resolvePhotoUrl(uri, "strip");
  }
  return readPreparedPhotoUri(uri, role, "strip");
}

/** The draft's own photo URI per role, `undefined` where the draft has none. */
export type ConfirmStripSources = Record<PhotoRole, string | undefined>;

export type ConfirmStripPhotos = {
  /** Starts a prepare for each role whose source is new or changed; drops stale roles. */
  update: (sources: ConfirmStripSources) => void;
  /** Per role the prepared strip URI once it landed, else the draft's own URI. */
  uris: (sources: ConfirmStripSources) => ConfirmStripSources;
  /** Forgets every role: settles still in flight are ignored. `update` can start fresh after. */
  dispose: () => void;
};

/**
 * Confirm's strip slots show the draft's own URI at once and swap to the prepared strip URI per
 * role. A failed prepare keeps the draft URI. `onChange` fires when a prepared URI lands.
 */
export function createConfirmStripPhotos(
  prepare: (uri: string, role: PhotoRole) => Promise<string>,
  onChange: () => void,
): ConfirmStripPhotos {
  const entries = new Map<PhotoRole, { source: string; prepared?: string }>();

  return {
    update: (sources) => {
      for (const role of PHOTO_ROLES) {
        const source = sources[role];
        const entry = entries.get(role);
        if (entry?.source === source) {
          continue;
        }
        entries.delete(role);
        if (!source) {
          continue;
        }
        const next: { source: string; prepared?: string } = { source };
        entries.set(role, next);
        prepare(source, role).then(
          (prepared) => {
            if (entries.get(role) === next) {
              next.prepared = prepared;
              onChange();
            }
          },
          () => {},
        );
      }
    },
    uris: (sources) => {
      const next = { ...sources };
      for (const role of PHOTO_ROLES) {
        const entry = entries.get(role);
        if (entry?.prepared && entry.source === sources[role]) {
          next[role] = entry.prepared;
        }
      }
      return next;
    },
    dispose: () => entries.clear(),
  };
}

/** Photo lightbox — local prepared uncropped or server `variant=lightbox`. */
export async function resolveConfirmLightboxUri(uri: string, role: PhotoRole): Promise<string> {
  if (isServerPhotoUri(uri)) {
    return resolvePhotoUrl(uri, "lightbox");
  }
  return readPreparedPhotoUri(uri, role, "lightbox");
}
