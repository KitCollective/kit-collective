import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dismissProfilePrompt,
  nextProfilePromptState,
  type PromptStore,
  readProfilePromptState,
  shouldShowProfilePrompt,
  storeProfilePromptState,
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

  it("waits on an empty Samling and arms when the first jersey appears", () => {
    const next = (state: "none" | "waiting", jerseyCount: number, arrived = false) =>
      nextProfilePromptState({ state, jerseyCount, arrivedWithSavedJersey: arrived });

    expect(next("none", 0)).toBe("waiting");
    expect(next("waiting", 0)).toBeNull();
    expect(next("waiting", 1)).toBe("armed");
  });

  it("arms an arrival from the first session with the jersey just saved", () => {
    expect(
      nextProfilePromptState({ state: "none", jerseyCount: 3, arrivedWithSavedJersey: true }),
    ).toBe("armed");
  });

  it("never arms an existing collector, with one jersey or many", () => {
    for (const jerseyCount of [1, 2, 12]) {
      expect(
        nextProfilePromptState({ state: "none", jerseyCount, arrivedWithSavedJersey: false }),
      ).toBeNull();
    }
  });

  it("never changes state once armed, dismissed or still unread", () => {
    for (const state of ["armed", "dismissed", null] as const) {
      expect(
        nextProfilePromptState({ state, jerseyCount: 1, arrivedWithSavedJersey: true }),
      ).toBeNull();
    }
  });

  it("an existing collector with one jersey stays unprompted through the storage round trip", async () => {
    const store = memoryStore();
    const state = await readProfilePromptState(store, "user-a");

    expect(state).toBe("none");
    expect(
      nextProfilePromptState({ state, jerseyCount: 1, arrivedWithSavedJersey: false }),
    ).toBeNull();
    expect(shouldShowProfilePrompt({ jerseyCount: 1, state })).toBe(false);
  });

  it("a new collector goes waiting, armed, then dismissed across launches", async () => {
    const store = memoryStore();

    await storeProfilePromptState(store, "user-a", "waiting");
    expect(await readProfilePromptState(store, "user-a")).toBe("waiting");
    await storeProfilePromptState(store, "user-a", "armed");
    expect(await readProfilePromptState(store, "user-a")).toBe("armed");
    await dismissProfilePrompt(store, "user-a");
    expect(await readProfilePromptState(store, "user-a")).toBe("dismissed");
    expect(await readProfilePromptState(store, "user-b")).toBe("none");
  });

  it("a storage failure hides the prompt rather than nagging", async () => {
    expect(await readProfilePromptState(brokenStore, "user-a")).toBe("dismissed");
    expect(await storeProfilePromptState(brokenStore, "user-a", "armed")).toBe(false);
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
    expect(collection).toContain("nextProfilePromptState");
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
