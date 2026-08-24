import type { JerseyCondition, JerseySize, KitType, PhotoRole, PhotoSource } from "@kit/domain";
import { PHOTO_ROLES } from "@kit/domain";
import type {
  CaptureBranch,
  CaptureJerseyDraft,
  CaptureSessionPhoto,
  CaptureSessionState,
  CaptureSessionStore,
} from "./captureSessionTypes";

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type { CaptureBranch, CaptureJerseyDraft, CaptureSessionState, CaptureSessionStore };

export function branchFromPhotoCount(count: number): CaptureBranch {
  return count > 3 ? "bulk" : "single";
}

export function canSave(draft: CaptureJerseyDraft): boolean {
  if (draft.photos.length === 0) {
    return false;
  }
  if (!draft.clubId || !draft.seasonId) {
    return false;
  }
  if (!draft.kitTypeSelected || !draft.sizeSelected || !draft.conditionSelected) {
    return false;
  }
  return draft.kitType !== null && draft.size !== null && draft.condition !== null;
}

export function photoUriForRole(draft: CaptureJerseyDraft, role: PhotoRole): string | null {
  const photo = draft.photos.find((entry) => entry.role === role);
  return photo?.uri ?? null;
}

export function getDraft(state: CaptureSessionState, draftId: string): CaptureJerseyDraft {
  const draft = state.drafts.find((entry) => entry.id === draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }
  return draft;
}

export function getActiveDraft(state: CaptureSessionState): CaptureJerseyDraft {
  return getDraft(state, state.activeDraftId);
}

function createEmptyDraft(id: string): CaptureJerseyDraft {
  return {
    id,
    clubId: null,
    clubLabel: null,
    seasonId: null,
    kitType: null,
    size: null,
    condition: null,
    kitTypeSelected: false,
    sizeSelected: false,
    conditionSelected: false,
    notes: "",
    photos: [],
  };
}

function assignSingleRoles(uris: string[], source: PhotoSource): CaptureSessionPhoto[] {
  return uris.map((uri, index) => ({
    uri,
    role: PHOTO_ROLES[index] ?? null,
    source,
  }));
}

function persist(state: CaptureSessionState): void {
  state.store?.save(state);
}

function withState(state: CaptureSessionState, next: CaptureSessionState): CaptureSessionState {
  const persisted = { ...next, store: state.store };
  persist(persisted);
  return persisted;
}

function updateDraft(
  state: CaptureSessionState,
  draftId: string,
  updater: (draft: CaptureJerseyDraft) => CaptureJerseyDraft,
): CaptureSessionState {
  return withState(state, {
    ...state,
    drafts: state.drafts.map((draft) => (draft.id === draftId ? updater(draft) : draft)),
  });
}

export function createCaptureSession(
  orderedUris: string[],
  options?: { store?: CaptureSessionStore; sessionId?: string; photoSource?: PhotoSource },
): CaptureSessionState {
  const branch = branchFromPhotoCount(orderedUris.length);
  const draftId = createId();
  const sessionId = options?.sessionId ?? createId();
  const photoSource = options?.photoSource ?? "gallery";

  const draft =
    branch === "single"
      ? {
          ...createEmptyDraft(draftId),
          photos: assignSingleRoles(orderedUris, photoSource).filter(
            (photo): photo is CaptureSessionPhoto & { role: PhotoRole } => photo.role !== null,
          ),
        }
      : createEmptyDraft(draftId);

  const state: CaptureSessionState = {
    sessionId,
    branch,
    orderedUris: [...orderedUris],
    unboundUris: branch === "bulk" ? [...orderedUris] : [],
    drafts: [draft],
    activeDraftId: draftId,
    store: options?.store,
  };

  persist(state);
  return state;
}

export function createCaptureSessionFromPhotos(
  photos: CaptureSessionPhoto[],
  options?: { store?: CaptureSessionStore; sessionId?: string },
): CaptureSessionState {
  const boundPhotos = photos.filter(
    (photo): photo is CaptureSessionPhoto & { role: PhotoRole } => photo.role !== null,
  );
  const orderedUris = boundPhotos.map((photo) => photo.uri);
  const branch = branchFromPhotoCount(orderedUris.length);
  const draftId = createId();
  const sessionId = options?.sessionId ?? createId();

  const draft =
    branch === "single"
      ? {
          ...createEmptyDraft(draftId),
          photos: boundPhotos,
        }
      : createEmptyDraft(draftId);

  const state: CaptureSessionState = {
    sessionId,
    branch,
    orderedUris: [...orderedUris],
    unboundUris: branch === "bulk" ? [...orderedUris] : [],
    drafts: [draft],
    activeDraftId: draftId,
    store: options?.store,
  };

  persist(state);
  return state;
}

export function bindPhoto(
  state: CaptureSessionState,
  uri: string,
  draftId: string,
  role?: PhotoRole,
  source: PhotoSource = "gallery",
): CaptureSessionState {
  if (!state.unboundUris.includes(uri)) {
    throw new Error("Photo is not unbound");
  }

  const nextUnbound = state.unboundUris.filter((entry) => entry !== uri);
  return updateDraft({ ...state, unboundUris: nextUnbound }, draftId, (draft) => {
    const photos =
      role === undefined
        ? [...draft.photos, { uri, role: null, source }]
        : [...draft.photos.filter((photo) => photo.role !== role), { uri, role, source }];
    return { ...draft, photos };
  });
}

export function unbindPhoto(state: CaptureSessionState, uri: string): CaptureSessionState {
  const owningDraft = state.drafts.find((draft) => draft.photos.some((photo) => photo.uri === uri));
  if (!owningDraft) {
    throw new Error("Photo is not bound");
  }

  const nextUnbound = state.unboundUris.includes(uri)
    ? state.unboundUris
    : state.orderedUris.filter(
        (orderedUri) => orderedUri === uri || state.unboundUris.includes(orderedUri),
      );

  return updateDraft({ ...state, unboundUris: nextUnbound }, owningDraft.id, (draft) => ({
    ...draft,
    photos: draft.photos.filter((photo) => photo.uri !== uri),
  }));
}

export function addJerseyDraft(state: CaptureSessionState): CaptureSessionState {
  const draftId = createId();
  return withState(state, {
    ...state,
    drafts: [...state.drafts, createEmptyDraft(draftId)],
    activeDraftId: draftId,
  });
}

export function setActiveDraft(state: CaptureSessionState, draftId: string): CaptureSessionState {
  if (!state.drafts.some((draft) => draft.id === draftId)) {
    throw new Error("Draft not found");
  }

  return withState(state, {
    ...state,
    activeDraftId: draftId,
  });
}

export function removeDraft(state: CaptureSessionState, draftId: string): CaptureSessionState {
  const remaining = state.drafts.filter((draft) => draft.id !== draftId);
  if (remaining.length === 0) {
    return withState(state, {
      ...state,
      drafts: remaining,
      activeDraftId: "",
    });
  }

  const nextActiveId =
    state.activeDraftId === draftId
      ? (remaining[0]?.id ?? state.activeDraftId)
      : state.activeDraftId;

  return withState(state, {
    ...state,
    drafts: remaining,
    activeDraftId: nextActiveId,
  });
}

export function switchSingleToBulkBind(state: CaptureSessionState): CaptureSessionState {
  if (state.branch !== "single") {
    return state;
  }

  return withState(state, {
    ...state,
    branch: "bulk",
  });
}

export function nextAvailableRole(draft: CaptureJerseyDraft): PhotoRole | null {
  for (const role of PHOTO_ROLES) {
    if (!draft.photos.some((photo) => photo.role === role)) {
      return role;
    }
  }
  return null;
}

export function bindUnboundPhotoToDraft(
  state: CaptureSessionState,
  uri: string,
  draftId: string,
  role?: PhotoRole,
  source: PhotoSource = "gallery",
): CaptureSessionState {
  const draft = getDraft(state, draftId);
  const targetRole = role ?? nextAvailableRole(draft);
  if (!targetRole) {
    return state;
  }

  return bindPhoto(state, uri, draftId, targetRole, source);
}

export function setDraftClub(
  state: CaptureSessionState,
  draftId: string,
  clubId: string,
  clubLabel?: string | null,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    clubId,
    clubLabel: clubLabel ?? draft.clubLabel,
    seasonId: draft.clubId === clubId ? draft.seasonId : null,
  }));
}

export function setDraftSeason(
  state: CaptureSessionState,
  draftId: string,
  seasonId: string,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    seasonId,
  }));
}

export function selectDraftKitType(
  state: CaptureSessionState,
  draftId: string,
  kitType: KitType,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    kitType,
    kitTypeSelected: true,
  }));
}

export function selectDraftSize(
  state: CaptureSessionState,
  draftId: string,
  size: JerseySize,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    size,
    sizeSelected: true,
  }));
}

export function selectDraftCondition(
  state: CaptureSessionState,
  draftId: string,
  condition: JerseyCondition,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    condition,
    conditionSelected: true,
  }));
}

export function setDraftNotes(
  state: CaptureSessionState,
  draftId: string,
  notes: string,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    notes,
  }));
}

export function upsertDraftPhoto(
  state: CaptureSessionState,
  draftId: string,
  role: PhotoRole,
  uri: string,
  source: PhotoSource,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    photos: [...draft.photos.filter((photo) => photo.role !== role), { uri, role, source }],
  }));
}

function serializableState(state: CaptureSessionState): CaptureSessionState {
  const { store: _store, ...rest } = state;
  return rest;
}

export function createMemoryCaptureSessionStore(): CaptureSessionStore {
  let snapshot: CaptureSessionState | null = null;
  return {
    save(state) {
      snapshot = structuredClone(serializableState(state));
    },
    load() {
      return snapshot ? structuredClone(snapshot) : null;
    },
    clear() {
      snapshot = null;
    },
  };
}

export function reloadCaptureSession(store: CaptureSessionStore): CaptureSessionState | null {
  return store.load();
}
