import type { JerseyCondition, JerseySize, KitType, PhotoRole, PhotoSource } from "@kit/domain";
import { MAX_USER_JERSEY_PHOTOS, UNIVERSAL_PHOTO_ROLES } from "@kit/domain";
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
  return count > MAX_USER_JERSEY_PHOTOS ? "bulk" : "single";
}

export function canAddPhotoToDraft(draft: CaptureJerseyDraft): boolean {
  return draft.photos.length < MAX_USER_JERSEY_PHOTOS;
}

export const JERSEY_PHOTO_CAP_HELPER_DA = "Du kan højst have 10 fotos på én trøje.";

export function canSave(draft: CaptureJerseyDraft): boolean {
  if (!draft.editJerseyId && draft.photos.length === 0) {
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
    seasonLabel: null,
    kitType: null,
    size: null,
    condition: null,
    kitTypeSelected: false,
    sizeSelected: false,
    conditionSelected: false,
    notes: "",
    playerName: "",
    playerId: null,
    playerNumber: "",
    badgeEnabled: false,
    badgeId: null,
    badgeLabel: null,
    photos: [],
  };
}

function createPhotoId(): string {
  return createId();
}

function photoIdForUri(state: CaptureSessionState, uri: string): string {
  if (!state.photoIdByUri) {
    state.photoIdByUri = photoIdsForUris(state.orderedUris);
  }
  if (!state.photoIdByUri[uri]) {
    state.photoIdByUri[uri] = createPhotoId();
  }
  return state.photoIdByUri[uri];
}

function photoIdsForUris(uris: string[]): Record<string, string> {
  return Object.fromEntries(uris.map((uri) => [uri, createPhotoId()]));
}

function withPhotoId(
  uri: string,
  role: PhotoRole | null,
  source: PhotoSource,
  photoId?: string,
): CaptureSessionPhoto {
  return { photoId: photoId ?? createPhotoId(), uri, role, source };
}

export function assignPhotosFillOrder(uris: string[], source: PhotoSource): CaptureSessionPhoto[] {
  const capped = uris.slice(0, MAX_USER_JERSEY_PHOTOS);
  return capped.map((uri, index) => {
    const role: PhotoRole =
      index < UNIVERSAL_PHOTO_ROLES.length ? UNIVERSAL_PHOTO_ROLES[index]! : "other";
    return withPhotoId(uri, role, source);
  });
}

/** Assign roles in picker order while preserving each photo's source. */
export function assignPhotosFillOrderPreservingSource(
  photos: CaptureSessionPhoto[],
): CaptureSessionPhoto[] {
  const capped = photos.slice(0, MAX_USER_JERSEY_PHOTOS);
  return capped.map((photo, index) => {
    const role: PhotoRole =
      index < UNIVERSAL_PHOTO_ROLES.length ? UNIVERSAL_PHOTO_ROLES[index]! : "other";
    return withPhotoId(photo.uri, role, photo.source, photo.photoId);
  });
}

function assignSingleRoles(uris: string[], source: PhotoSource): CaptureSessionPhoto[] {
  return assignPhotosFillOrder(uris, source);
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
          photos: assignSingleRoles(orderedUris, photoSource),
        }
      : createEmptyDraft(draftId);

  const state: CaptureSessionState = {
    sessionId,
    branch,
    orderedUris: [...orderedUris],
    unboundUris: branch === "bulk" ? [...orderedUris] : [],
    photoIdByUri: photoIdsForUris(orderedUris),
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
  const orderedUris = photos.map((photo) => photo.uri);
  const branch = branchFromPhotoCount(orderedUris.length);
  const draftId = createId();
  const sessionId = options?.sessionId ?? createId();

  const draft =
    branch === "single"
      ? {
          ...createEmptyDraft(draftId),
          photos: [...photos],
        }
      : createEmptyDraft(draftId);

  const state: CaptureSessionState = {
    sessionId,
    branch,
    orderedUris: [...orderedUris],
    unboundUris: branch === "bulk" ? [...orderedUris] : [],
    photoIdByUri: Object.fromEntries(
      photos.map((photo) => [photo.uri, photo.photoId ?? createPhotoId()]),
    ),
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
  const photoId = photoIdForUri(state, uri);
  return updateDraft({ ...state, unboundUris: nextUnbound }, draftId, (draft) => {
    const photos =
      role === undefined
        ? [...draft.photos, withPhotoId(uri, null, source, photoId)]
        : [
            ...draft.photos.filter((photo) => photo.role !== role),
            withPhotoId(uri, role, source, photoId),
          ];
    return { ...draft, photos };
  });
}

export function discardUnboundPhoto(state: CaptureSessionState, uri: string): CaptureSessionState {
  if (!state.unboundUris.includes(uri)) {
    throw new Error("Photo is not unbound");
  }

  return withState(state, {
    ...state,
    orderedUris: state.orderedUris.filter((entry) => entry !== uri),
    unboundUris: state.unboundUris.filter((entry) => entry !== uri),
  });
}

export function appendUnboundPhotos(
  state: CaptureSessionState,
  uris: string[],
): CaptureSessionState {
  const nextUris = uris.filter(
    (uri) => !state.orderedUris.includes(uri) && !state.unboundUris.includes(uri),
  );
  if (nextUris.length === 0) {
    return state;
  }

  return withState(state, {
    ...state,
    orderedUris: [...state.orderedUris, ...nextUris],
    unboundUris: [...state.unboundUris, ...nextUris],
    photoIdByUri: {
      ...state.photoIdByUri,
      ...photoIdsForUris(nextUris),
    },
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
  for (const role of UNIVERSAL_PHOTO_ROLES) {
    if (!draft.photos.some((photo) => photo.role === role)) {
      return role;
    }
  }
  if (draft.photos.length < MAX_USER_JERSEY_PHOTOS) {
    return "other";
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
  return updateDraft(state, draftId, (draft) => {
    const clubChanged = draft.clubId !== clubId;
    return {
      ...draft,
      clubId,
      clubLabel: clubLabel ?? draft.clubLabel,
      seasonId: clubChanged ? null : draft.seasonId,
      seasonLabel: clubChanged ? null : draft.seasonLabel,
      playerId: clubChanged ? null : draft.playerId,
      playerName: clubChanged ? "" : draft.playerName,
      playerNumber: clubChanged ? "" : draft.playerNumber,
      badgeEnabled: clubChanged ? false : draft.badgeEnabled,
      badgeId: clubChanged ? null : draft.badgeId,
      badgeLabel: clubChanged ? null : draft.badgeLabel,
    };
  });
}

export function setDraftSeason(
  state: CaptureSessionState,
  draftId: string,
  seasonId: string,
  seasonLabel?: string | null,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => {
    const seasonChanged = draft.seasonId !== seasonId;
    return {
      ...draft,
      seasonId,
      seasonLabel: seasonLabel ?? draft.seasonLabel,
      playerId: seasonChanged ? null : draft.playerId,
      playerName: seasonChanged ? "" : draft.playerName,
      playerNumber: seasonChanged ? "" : draft.playerNumber,
      badgeId: seasonChanged ? null : draft.badgeId,
      badgeLabel: seasonChanged ? null : draft.badgeLabel,
    };
  });
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

export function setDraftPlayerName(
  state: CaptureSessionState,
  draftId: string,
  playerName: string,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    playerName,
  }));
}

export function setDraftPlayer(
  state: CaptureSessionState,
  draftId: string,
  player: { id: string; name: string; number: string } | null,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    playerId: player?.id ?? null,
    playerName: player?.name ?? "",
    playerNumber: player?.number ?? "",
  }));
}

export function setDraftBadgeEnabled(
  state: CaptureSessionState,
  draftId: string,
  enabled: boolean,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    badgeEnabled: enabled,
    badgeId: enabled ? draft.badgeId : null,
    badgeLabel: enabled ? draft.badgeLabel : null,
  }));
}

export function setDraftBadge(
  state: CaptureSessionState,
  draftId: string,
  badge: { id: string; label: string } | null,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    badgeEnabled: badge !== null ? true : draft.badgeEnabled,
    badgeId: badge?.id ?? null,
    badgeLabel: badge?.label ?? null,
  }));
}

export function upsertDraftPhoto(
  state: CaptureSessionState,
  draftId: string,
  role: PhotoRole,
  uri: string,
  source: PhotoSource,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => {
    if (role === "other") {
      if (draft.photos.some((photo) => photo.uri === uri)) {
        return draft;
      }
      if (draft.photos.length >= MAX_USER_JERSEY_PHOTOS) {
        return draft;
      }
      return {
        ...draft,
        photos: [...draft.photos, withPhotoId(uri, role, source, photoIdForUri(state, uri))],
      };
    }

    return {
      ...draft,
      photos: [
        ...draft.photos.filter((photo) => photo.role !== role),
        withPhotoId(uri, role, source, photoIdForUri(state, uri)),
      ],
    };
  });
}

export function setDraftPhotoLabel(
  state: CaptureSessionState,
  draftId: string,
  uri: string,
  label: string,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    photos: draft.photos.map((photo) => (photo.uri === uri ? { ...photo, label } : photo)),
  }));
}

export function removeDraftPhoto(
  state: CaptureSessionState,
  draftId: string,
  role: PhotoRole,
  uri?: string,
): CaptureSessionState {
  return updateDraft(state, draftId, (draft) => ({
    ...draft,
    photos: draft.photos.filter((photo) => {
      if (role === "other" && uri) {
        return photo.uri !== uri;
      }
      return photo.role !== role;
    }),
  }));
}

export function changeDraftPhotoRole(
  state: CaptureSessionState,
  draftId: string,
  fromRole: PhotoRole,
  toRole: PhotoRole,
  fromUri?: string,
): CaptureSessionState {
  if (fromRole === toRole) {
    return state;
  }

  return updateDraft(state, draftId, (draft) => {
    const sourcePhoto =
      fromRole === "other" && fromUri
        ? draft.photos.find((photo) => photo.uri === fromUri)
        : draft.photos.find((photo) => photo.role === fromRole);
    if (!sourcePhoto) {
      return draft;
    }

    const targetPhoto =
      toRole !== "other" ? draft.photos.find((photo) => photo.role === toRole) : undefined;
    if (targetPhoto) {
      return {
        ...draft,
        photos: draft.photos.map((photo) => {
          if (photo.uri === sourcePhoto.uri) {
            return { ...photo, role: toRole };
          }
          if (photo.uri === targetPhoto.uri) {
            return { ...photo, role: fromRole };
          }
          return photo;
        }),
      };
    }

    return {
      ...draft,
      photos: draft.photos.map((photo) =>
        photo.uri === sourcePhoto.uri ? { ...photo, role: toRole } : photo,
      ),
    };
  });
}

export function appendCameraShotToSession(
  state: CaptureSessionState,
  photo: CaptureSessionPhoto & { role: PhotoRole },
  source: PhotoSource = "camera",
): CaptureSessionState {
  const next = upsertDraftPhoto(state, state.activeDraftId, photo.role, photo.uri, source);
  const draft = getActiveDraft(next);
  const orderedUris = [
    ...UNIVERSAL_PHOTO_ROLES.map(
      (role) => draft.photos.find((entry) => entry.role === role)?.uri,
    ).filter((uri): uri is string => Boolean(uri)),
    ...draft.photos.filter((entry) => entry.role === "other").map((entry) => entry.uri),
  ];
  return {
    ...next,
    orderedUris,
  };
}

/** Shoot-first repeat camera: append a shot without assigning a role until Confirm. */
export function appendUnassignedCameraShotToSession(
  state: CaptureSessionState,
  uri: string,
  source: PhotoSource = "camera",
): CaptureSessionState {
  const draft = getActiveDraft(state);
  if (!canAddPhotoToDraft(draft)) {
    return state;
  }

  const next = updateDraft(state, state.activeDraftId, (current) => ({
    ...current,
    photos: [...current.photos, withPhotoId(uri, null, source, photoIdForUri(state, uri))],
  }));
  const updatedDraft = getActiveDraft(next);
  return {
    ...next,
    orderedUris: updatedDraft.photos.map((photo) => photo.uri),
  };
}

/** Apply Forside → Bagside → Venstre → Højre → Andet fill order before Confirm. */
export function applyFillOrderToActiveDraft(state: CaptureSessionState): CaptureSessionState {
  const draft = getActiveDraft(state);
  if (draft.photos.length === 0 || draft.photos.every((photo) => photo.role !== null)) {
    return state;
  }

  const assigned = assignPhotosFillOrderPreservingSource(draft.photos);
  const next = updateDraft(state, state.activeDraftId, (current) => ({
    ...current,
    photos: assigned,
  }));
  return {
    ...next,
    orderedUris: assigned.map((photo) => photo.uri),
  };
}

function serializableState(state: CaptureSessionState): CaptureSessionState {
  const { store: _store, ...rest } = state;
  return rest;
}

export function createEditCaptureSession(
  jersey: {
    id: string;
    clubId: string;
    clubLabel: string;
    seasonId: string;
    type: KitType;
    size: JerseySize;
    condition: JerseyCondition;
  },
  sessionId: string,
  store?: CaptureSessionStore,
): CaptureSessionState {
  const draftId = createId();
  const draft: CaptureJerseyDraft = {
    id: draftId,
    clubId: jersey.clubId,
    clubLabel: jersey.clubLabel,
    seasonId: jersey.seasonId,
    kitType: jersey.type,
    size: jersey.size,
    condition: jersey.condition,
    kitTypeSelected: true,
    sizeSelected: true,
    conditionSelected: true,
    notes: "",
    playerName: "",
    playerId: null,
    playerNumber: "",
    seasonLabel: null,
    badgeEnabled: false,
    badgeId: null,
    badgeLabel: null,
    photos: [],
    editJerseyId: jersey.id,
  };

  const state: CaptureSessionState = {
    sessionId,
    branch: "single",
    orderedUris: [],
    unboundUris: [],
    photoIdByUri: {},
    drafts: [draft],
    activeDraftId: draftId,
    store,
  };

  persist(state);
  return state;
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
  const loaded = store.load();
  if (!loaded) {
    return null;
  }

  return {
    ...loaded,
    photoIdByUri: loaded.photoIdByUri ?? photoIdsForUris(loaded.orderedUris),
  };
}

export function shouldStartGroupingJob(state: CaptureSessionState): boolean {
  if (state.branch !== "bulk") {
    return false;
  }

  return state.unboundUris.length === state.orderedUris.length && state.unboundUris.length >= 2;
}

export function uriForPhotoId(state: CaptureSessionState, photoId: string): string | null {
  const entry = Object.entries(state.photoIdByUri ?? {}).find(([, id]) => id === photoId);
  return entry?.[0] ?? null;
}

function ensureDraftForGroupIndex(
  state: CaptureSessionState,
  groupIndex: number,
): CaptureSessionState {
  let next = state;
  while (next.drafts.length <= groupIndex) {
    next = addJerseyDraft(next);
  }
  return next;
}

function bindPhotoIdsToDraft(
  state: CaptureSessionState,
  draftId: string,
  photoIds: string[],
): CaptureSessionState {
  let next = state;
  for (const photoId of photoIds) {
    const uri = uriForPhotoId(next, photoId);
    if (!uri || !next.unboundUris.includes(uri)) {
      continue;
    }
    const draft = getDraft(next, draftId);
    if (!canAddPhotoToDraft(draft)) {
      break;
    }
    next = bindPhoto(next, uri, draftId, undefined);
  }
  return next;
}

export function applyGroupingSuggestion(
  state: CaptureSessionState,
  grouping: { groups: Array<{ photoIds: string[] }> },
  options: { preselect: boolean },
): CaptureSessionState {
  if (grouping.groups.length === 0) {
    return state;
  }

  if (!options.preselect) {
    if (grouping.groups.length > 1) {
      return withState(state, {
        ...state,
        pendingGrouping: grouping,
        groupingDesignGap: true,
      });
    }

    return withState(state, {
      ...state,
      pendingGrouping: grouping,
      groupingDesignGap: false,
    });
  }

  let next = withState(state, {
    ...state,
    pendingGrouping: undefined,
    groupingDesignGap: false,
  });

  grouping.groups.forEach((group, index) => {
    next = ensureDraftForGroupIndex(next, index);
    const draftId = next.drafts[index]?.id;
    if (!draftId) {
      return;
    }
    next = bindPhotoIdsToDraft(next, draftId, group.photoIds);
  });

  if (next.drafts[0]) {
    next = setActiveDraft(next, next.drafts[0].id);
  }

  return next;
}

export function acceptPendingGrouping(state: CaptureSessionState): CaptureSessionState {
  if (!state.pendingGrouping) {
    return state;
  }

  return applyGroupingSuggestion(state, state.pendingGrouping, { preselect: true });
}

export function dismissPendingGrouping(state: CaptureSessionState): CaptureSessionState {
  if (!state.pendingGrouping) {
    return state;
  }

  return withState(state, {
    ...state,
    pendingGrouping: undefined,
    groupingDesignGap: false,
  });
}

export function sessionPhotoIds(state: CaptureSessionState): string[] {
  return Object.values(state.photoIdByUri ?? {});
}

export type IdentitySuggestionInput = {
  clubId?: string;
  clubLabel?: string;
  seasonId?: string;
  seasonLabel?: string;
  type?: KitType;
};

export type IdentityFieldPreselect = {
  club?: boolean;
  season?: boolean;
  type?: boolean;
};

export type IdentityManualEditMask = {
  club?: boolean;
  season?: boolean;
  type?: boolean;
};

export function applyIdentitySuggestion(
  state: CaptureSessionState,
  draftId: string,
  suggestions: IdentitySuggestionInput,
  options: {
    fieldPreselect: IdentityFieldPreselect;
    manualEdits?: IdentityManualEditMask;
  },
): CaptureSessionState {
  const manual = options.manualEdits ?? {};
  let next = state;

  if (
    !manual.club &&
    options.fieldPreselect.club &&
    suggestions.clubId &&
    suggestions.clubLabel
  ) {
    next = setDraftClub(next, draftId, suggestions.clubId, suggestions.clubLabel);
  }

  if (!manual.season && options.fieldPreselect.season && suggestions.seasonId) {
    next = setDraftSeason(next, draftId, suggestions.seasonId);
  }

  if (!manual.type && options.fieldPreselect.type && suggestions.type) {
    next = selectDraftKitType(next, draftId, suggestions.type);
  }

  return next;
}

