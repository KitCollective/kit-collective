import type { JerseyCondition, JerseySize, KitType, PhotoRole, PhotoSource } from "@kit/domain";

export type DraftPhoto = {
  role: PhotoRole;
  uri: string;
  source: PhotoSource;
};

export type JerseyDraftRow = {
  id: string;
  clubId: string | null;
  clubLabel: string | null;
  seasonId: string | null;
  kitType: KitType;
  size: JerseySize;
  condition: JerseyCondition;
  activeRole: PhotoRole | null;
  photos: DraftPhoto[];
};
