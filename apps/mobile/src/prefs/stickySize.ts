import { JERSEY_SIZES, type JerseySize } from "@kit/domain";

/**
 * Last saved size, kept per collector on the device (design lock: Confirm and Save,
 * Revision 2026-10-09, item 9). Size is a sticky default; condition never is.
 */
export type StickySizeStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

export function stickySizeKey(collectorId: string): string {
  return `kit.sticky-size.v1.${collectorId}`;
}

export function parseStickySize(raw: string | null | undefined): JerseySize | null {
  return JERSEY_SIZES.find((size) => size === raw) ?? null;
}

/**
 * Synchronous reads for the session reducers, async persistence behind them. `bind` hydrates
 * the signed-in collector's size from storage; `remember` updates memory at once and writes
 * through without ever throwing into the Save path.
 */
export function createStickySizeStore(storage: StickySizeStorage) {
  let collectorId: string | null = null;
  let current: JerseySize | null = null;

  return {
    async bind(nextCollectorId: string | null): Promise<void> {
      collectorId = nextCollectorId;
      current = null;
      if (!nextCollectorId) {
        return;
      }
      try {
        const stored = parseStickySize(await storage.get(stickySizeKey(nextCollectorId)));
        if (collectorId === nextCollectorId && current === null) {
          current = stored;
        }
      } catch {
        // A device store that cannot be read means no default, never a blocked capture.
      }
    },
    get(): JerseySize | null {
      return current;
    },
    remember(size: JerseySize): void {
      current = size;
      if (!collectorId) {
        return;
      }
      void storage.set(stickySizeKey(collectorId), size).catch(() => undefined);
    },
  };
}

export type StickySizeStore = ReturnType<typeof createStickySizeStore>;
