/**
 * The Vision scan line runs once per photo, on its first identity read (design lock:
 * Confirm and Save, Revision 2026-10-09, item 4). Never on a reopen, never with Reduce Motion
 * (same end state, no travel). Reduce Motion does not use up the photo's turn.
 */
export function createScanLineLedger() {
  const ran = new Set<string>();

  return {
    shouldRun(
      photoKey: string | null | undefined,
      input: { inFlight: boolean; reduceMotion: boolean },
    ): boolean {
      if (!photoKey || !input.inFlight || input.reduceMotion || ran.has(photoKey)) {
        return false;
      }
      ran.add(photoKey);
      return true;
    },
    hasRun(photoKey: string): boolean {
      return ran.has(photoKey);
    },
  };
}

/** Lives for the app session, so reopening a jersey in the same run stays quiet. */
export const scanLineLedger = createScanLineLedger();
