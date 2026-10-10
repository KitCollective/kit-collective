/**
 * The Vision switch on the capture Chooser (docs/design-system.md → Capture session,
 * Revision 2026-10-09, item 2). A per-device setting, default on, remembered. Not a Plus
 * feature and not a privacy setting.
 */
export type VisionSwitchStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

export const VISION_SWITCH_KEY = "kit.vision-switch.v1";

/** Only an explicit "off" turns Vision off; anything else (missing, unreadable) is the default. */
export function parseVisionSwitch(raw: string | null | undefined): boolean {
  return raw !== "off";
}

/**
 * Synchronous reads for the capture flow, async persistence behind them. `hydrate` loads the
 * remembered choice; `set` updates memory at once and writes through without ever throwing
 * into the Chooser.
 */
export function createVisionSwitchStore(storage: VisionSwitchStorage) {
  let on = true;
  let touched = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    async hydrate(): Promise<void> {
      try {
        const stored = parseVisionSwitch(await storage.get(VISION_SWITCH_KEY));
        if (!touched && stored !== on) {
          on = stored;
          emit();
        }
      } catch {
        // A device store that cannot be read means the default, never a blocked capture.
      }
    },
    get(): boolean {
      return on;
    },
    set(next: boolean): void {
      touched = true;
      if (next === on) {
        return;
      }
      on = next;
      emit();
      void storage.set(VISION_SWITCH_KEY, next ? "on" : "off").catch(() => undefined);
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type VisionSwitchStore = ReturnType<typeof createVisionSwitchStore>;
