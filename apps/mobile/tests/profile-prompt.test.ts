import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  armProfilePrompt,
  dismissProfilePrompt,
  type PromptStore,
  readProfilePromptState,
  shouldArmProfilePrompt,
  shouldShowProfilePrompt,
} from "../src/profile-prompt/dismissal";

function memoryStore(): PromptStore {
  const data = new Map<string, string>();
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
  };
}

const brokenStore: PromptStore = {
  get: async () => {
    throw new Error("storage unavailable");
  },
  set: async () => {
    throw new Error("storage unavailable");
  },
};

describe("profile prompt", () => {
  it("shows only once armed by the first save, and until it is dismissed", () => {
    expect(shouldShowProfilePrompt({ jerseyCount: 0, state: "armed" })).toBe(false);
    expect(shouldShowProfilePrompt({ jerseyCount: 1, state: "armed" })).toBe(true);
    expect(shouldShowProfilePrompt({ jerseyCount: 1, state: "none" })).toBe(false);
    expect(shouldShowProfilePrompt({ jerseyCount: 5, state: "dismissed" })).toBe(false);
  });

  it("waits for the stored answer instead of flashing the prompt", () => {
    expect(shouldShowProfilePrompt({ jerseyCount: 1, state: null })).toBe(false);
  });

  it("arms on the first saved jersey, not for a collector who already had a collection", () => {
    const arm = (jerseyCount: number, arrivedWithSavedJersey = false) =>
      shouldArmProfilePrompt({ state: "none", jerseyCount, arrivedWithSavedJersey });

    expect(arm(0)).toBe(false);
    expect(arm(1)).toBe(true);
    expect(arm(12)).toBe(false);
    expect(arm(3, true)).toBe(true);
    expect(arm(0, true)).toBe(false);
  });

  it("never re-arms once armed or dismissed", () => {
    for (const state of ["armed", "dismissed", null] as const) {
      expect(shouldArmProfilePrompt({ state, jerseyCount: 1, arrivedWithSavedJersey: true })).toBe(
        false,
      );
    }
  });

  it("an existing collector stays unprompted through the whole storage round trip", async () => {
    const store = memoryStore();
    const state = await readProfilePromptState(store, "user-a");

    expect(state).toBe("none");
    expect(shouldArmProfilePrompt({ state, jerseyCount: 8, arrivedWithSavedJersey: false })).toBe(
      false,
    );
    expect(shouldShowProfilePrompt({ jerseyCount: 8, state })).toBe(false);
  });

  it("does not return once dismissed, and is per collector", async () => {
    const store = memoryStore();

    await armProfilePrompt(store, "user-a");
    expect(await readProfilePromptState(store, "user-a")).toBe("armed");
    await dismissProfilePrompt(store, "user-a");
    expect(await readProfilePromptState(store, "user-a")).toBe("dismissed");
    expect(await readProfilePromptState(store, "user-b")).toBe("none");
  });

  it("a storage failure hides the prompt rather than nagging", async () => {
    expect(await readProfilePromptState(brokenStore, "user-a")).toBe("dismissed");
    expect(await armProfilePrompt(brokenStore, "user-a")).toBe(false);
    await expect(dismissProfilePrompt(brokenStore, "user-a")).resolves.toBeUndefined();
  });
});

describe("Samling profile prompt and first arrival chrome", () => {
  const collection = readFileSync(join(__dirname, "../app/(tabs)/collection/index.tsx"), "utf8");
  const prompt = readFileSync(join(__dirname, "../src/profile-prompt/profile-prompt.tsx"), "utf8");
  const copy = readFileSync(join(__dirname, "../src/profile-prompt/copy.ts"), "utf8");

  it("the prompt is dismissible and offers the profile editor", () => {
    expect(prompt).toContain('testID="profile-prompt"');
    expect(prompt).toContain('testID="profile-prompt-dismiss"');
    expect(copy).toContain("Ikke nu");
    expect(collection).toContain("ProfilePrompt");
    expect(collection).toContain("/(tabs)/profile/edit");
    expect(collection).toContain("shouldShowProfilePrompt");
    expect(collection).toContain("dismissProfilePrompt");
    expect(collection).toContain("armProfilePrompt");
  });

  it("first arrival shows one Tilføj din første trøje slot and the example-not-saved note", () => {
    const arrivalCopy = readFileSync(
      join(__dirname, "../src/first-session/first-arrival-copy.ts"),
      "utf8",
    );

    expect(arrivalCopy).toContain('FIRST_ARRIVAL_SLOT_LABEL = "Tilføj din første trøje"');
    expect(arrivalCopy).toContain("Eksemplet blev ikke gemt.");
    expect(collection).toContain("firstSessionArrival");
    expect(collection).toContain('testID="collection-first-slot"');
    expect(collection).toContain("FIRST_ARRIVAL_NOTE");
  });

  it("the profile editor route under Profil still exists", () => {
    const layout = readFileSync(join(__dirname, "../app/(tabs)/profile/_layout.tsx"), "utf8");
    expect(layout).toContain("edit");
  });
});
