import { describe, expect, it } from "vitest";
import {
  createVisionSwitchStore,
  parseVisionSwitch,
  VISION_SWITCH_KEY,
  type VisionSwitchStorage,
} from "../src/prefs/visionSwitch";

function memoryStorage(initial?: string): VisionSwitchStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) {
    data.set(VISION_SWITCH_KEY, initial);
  }
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
  };
}

describe("Vision switch store", () => {
  it("defaults to on, with nothing stored", async () => {
    const store = createVisionSwitchStore(memoryStorage());
    expect(store.get()).toBe(true);
    await store.hydrate();
    expect(store.get()).toBe(true);
  });

  it("remembers the choice across an app restart", async () => {
    const storage = memoryStorage();
    const first = createVisionSwitchStore(storage);
    first.set(false);
    await Promise.resolve();

    const afterRestart = createVisionSwitchStore(storage);
    await afterRestart.hydrate();
    expect(afterRestart.get()).toBe(false);

    afterRestart.set(true);
    await Promise.resolve();
    const again = createVisionSwitchStore(storage);
    await again.hydrate();
    expect(again.get()).toBe(true);
  });

  it("only an explicit off turns Vision off", () => {
    expect(parseVisionSwitch("off")).toBe(false);
    expect(parseVisionSwitch("on")).toBe(true);
    expect(parseVisionSwitch(null)).toBe(true);
    expect(parseVisionSwitch("garbage")).toBe(true);
  });

  it("does not let a late hydrate overwrite a choice made meanwhile", async () => {
    const store = createVisionSwitchStore(memoryStorage("off"));
    store.set(true);
    await store.hydrate();
    expect(store.get()).toBe(true);
  });

  it("keeps working when the device store cannot be read or written", async () => {
    const store = createVisionSwitchStore({
      get: async () => {
        throw new Error("locked");
      },
      set: async () => {
        throw new Error("locked");
      },
    });
    await expect(store.hydrate()).resolves.toBeUndefined();
    expect(() => store.set(false)).not.toThrow();
    expect(store.get()).toBe(false);
  });

  it("tells subscribers when the choice changes", () => {
    const store = createVisionSwitchStore(memoryStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.set(false);
    store.set(false);
    store.set(true);
    unsubscribe();
    store.set(false);
    expect(calls).toBe(2);
  });
});
