import type { JerseyCondition, JerseySize, KitType, PhotoRole, PhotoSource } from "@kit/domain";

export type CaptureBranch = "single" | "bulk";

export type CaptureSessionPhoto = {
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
};

export type CaptureSessionState = {
  sessionId: string;
  branch: CaptureBranch;
  orderedUris: string[];
  unboundUris: string[];
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
