import type { JerseyCondition, JerseySize, KitType, PhotoRole, PhotoSource } from "@kit/domain";

export type CaptureBranch = "single" | "bulk";

export type CaptureSessionPhoto = {
  uri: string;
  role: PhotoRole | null;
  source: PhotoSource;
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
  photos: CaptureSessionPhoto[];
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

export type CaptureSessionStore = {
  save(state: CaptureSessionState): void;
  load(): CaptureSessionState | null;
  clear(): void;
};
