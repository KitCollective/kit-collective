import type { JerseyCondition, JerseySize, KitType, PhotoRole, PhotoSource } from "@kit/domain";

export type CaptureBranch = "single" | "bulk";

export type CaptureSessionPhoto = {
  /** Stable id for Vision grouping — assigned when the photo enters the session. */
  photoId?: string;
  uri: string;
  role: PhotoRole | null;
  source: PhotoSource;
  /** Beskrivelse when role is other. */
  label?: string;
};

export type CaptureJerseyDraft = {
  id: string;
  clubId: string | null;
  clubLabel: string | null;
  nationalTeamId: string | null;
  nationalTeamLabel: string | null;
  seasonId: string | null;
  kitType: KitType | null;
  size: JerseySize | null;
  condition: JerseyCondition | null;
  kitTypeSelected: boolean;
  sizeSelected: boolean;
  conditionSelected: boolean;
  notes: string;
  playerName: string;
  playerId: string | null;
  playerNumber: string;
  seasonLabel: string | null;
  badgeEnabled: boolean;
  badgeId: string | null;
  badgeLabel: string | null;
  photos: CaptureSessionPhoto[];
  /** When set, Confirm saves via PATCH instead of POST save (metadata-only edit). */
  editJerseyId?: string;
  /** Vision grouped these photos with middling confidence (suggest band): the overview shows Tjek. */
  needsCheck?: boolean;
};

/** What the bulk overview keeps of a jersey after Gem: enough for its Gemt row. */
export type CaptureSavedDraft = {
  draftId: string;
  thumbUri: string | null;
  clubLabel: string | null;
  seasonLabel: string | null;
  kitType: KitType | null;
};

export type CaptureSessionState = {
  sessionId: string;
  branch: CaptureBranch;
  orderedUris: string[];
  unboundUris: string[];
  photoIdByUri?: Record<string, string>;
  /** Set once the bulk overview owns this session (Vision on, four or more photos). */
  overview?: boolean;
  /** When the collector chose Gør resten færdig senere; Samling shows one parked row while set. */
  parkedAt?: number | null;
  /** Unbound-photo fingerprint of the last finished grouping run, so a reopen does not re-ask Vision. */
  groupingSettledKey?: string;
  /** Jerseys saved from the overview, kept for their Gemt rows. */
  savedDrafts?: CaptureSavedDraft[];
  drafts: CaptureJerseyDraft[];
  activeDraftId: string;
  store?: CaptureSessionStore;
};

export type CaptureSessionMutator = (
  updater: (current: CaptureSessionState) => CaptureSessionState,
) => CaptureSessionState | null;

export type CaptureSessionStore = {
  save(state: CaptureSessionState): void;
  load(): CaptureSessionState | null;
  clear(): void;
};
