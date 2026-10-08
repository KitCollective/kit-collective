import { motion, space } from "@/theme/tokens";

const THUMB_WIDTH = space.insetLg * 3;
export const SANDBOX_THUMB_STEP = THUMB_WIDTH + space.gapSm;
/** Lift toward the Confirm slots while a jersey gathers. */
export const SANDBOX_GATHER_LIFT = space.insetLg * 2;
export const SANDBOX_GATHER_STAGGER_MS = motion.fast / 4;

export function sandboxGatherDelayMs(gatherIndex: number): number {
  if (gatherIndex <= 0) {
    return 0;
  }
  return gatherIndex * SANDBOX_GATHER_STAGGER_MS;
}

/** Horizontal offset so gathering thumbs stack on the first photo of the jersey. */
export function sandboxGatherTranslateX(
  uris: string[],
  gatheringUris: string[],
  uri: string,
): number {
  const anchor = gatheringUris[0];
  if (!anchor || !gatheringUris.includes(uri)) {
    return 0;
  }
  const anchorIndex = uris.indexOf(anchor);
  const myIndex = uris.indexOf(uri);
  if (anchorIndex < 0 || myIndex < 0) {
    return 0;
  }
  return (anchorIndex - myIndex) * SANDBOX_THUMB_STEP;
}
