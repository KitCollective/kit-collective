import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dismissProfilePrompt,
  isProfilePromptDismissed,
  type PromptStore,
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

describe("profile prompt dismissal", () => {
  it("shows only after the first jersey is saved and until it is dismissed", () => {
    expect(shouldShowProfilePrompt({ jerseyCount: 0, dismissed: false })).toBe(false);
    expect(shouldShowProfilePrompt({ jerseyCount: 1, dismissed: false })).toBe(true);
    expect(shouldShowProfilePrompt({ jerseyCount: 5, dismissed: true })).toBe(false);
  });

  it("waits for the stored answer instead of flashing the prompt", () => {
    expect(shouldShowProfilePrompt({ jerseyCount: 1, dismissed: null })).toBe(false);
  });

  it("does not return once dismissed, and is per collector", async () => {
    const store = memoryStore();

    expect(await isProfilePromptDismissed(store, "user-a")).toBe(false);
    await dismissProfilePrompt(store, "user-a");
    expect(await isProfilePromptDismissed(store, "user-a")).toBe(true);
    expect(await isProfilePromptDismissed(store, "user-b")).toBe(false);
  });

  it("a storage failure hides the prompt rather than nagging", async () => {
    expect(await isProfilePromptDismissed(brokenStore, "user-a")).toBe(true);
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
