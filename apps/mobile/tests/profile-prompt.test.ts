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

  const next = (input: {
    state: "none" | "waiting" | "armed" | "dismissed" | null;
    jerseyCount: number;
    collectionLoaded?: boolean;
    savedInFirstSession?: number;
  }) =>
    nextProfilePromptState({
      collectionLoaded: true,
      savedInFirstSession: 0,
      ...input,
    });

  it("waits on an empty Samling and arms when the first jersey appears", () => {
    expect(next({ state: "none", jerseyCount: 0 })).toBe("waiting");
    expect(next({ state: "waiting", jerseyCount: 0 })).toBeNull();
    expect(next({ state: "waiting", jerseyCount: 1 })).toBe("armed");
  });

  it("a failed or unfinished fetch never moves the prompt", () => {
    for (const state of ["none", "waiting"] as const) {
      expect(next({ state, jerseyCount: 0, collectionLoaded: false })).toBeNull();
      expect(next({ state, jerseyCount: 4, collectionLoaded: false })).toBeNull();
    }
  });

  it("an existing collector whose first fetch fails is not armed by the later success", () => {
    const afterFailure = next({ state: "none", jerseyCount: 0, collectionLoaded: false });
    expect(afterFailure).toBeNull();
    expect(next({ state: "none", jerseyCount: 5 })).toBeNull();
  });

  it("arms an arrival whose whole collection is the jerseys just saved", () => {
    expect(next({ state: "none", jerseyCount: 1, savedInFirstSession: 1 })).toBe("armed");
    expect(next({ state: "none", jerseyCount: 3, savedInFirstSession: 3 })).toBe("armed");
  });

  it("does not arm an existing collector who saved one jersey from the own-photo road", () => {
    expect(next({ state: "none", jerseyCount: 4, savedInFirstSession: 1 })).toBeNull();
  });

  it("never arms an existing collector, with one jersey or many", () => {
    for (const jerseyCount of [1, 2, 12]) {
      expect(next({ state: "none", jerseyCount })).toBeNull();
    }
  });

  it("never changes state once armed, dismissed or still unread", () => {
    for (const state of ["armed", "dismissed", null] as const) {
      expect(next({ state, jerseyCount: 1, savedInFirstSession: 1 })).toBeNull();
    }
  });

  it("an existing collector with one jersey stays unprompted through the storage round trip", async () => {
    const store = memoryStore();
    const state = await readProfilePromptState(store, "user-a");

    expect(state).toBe("none");
    expect(next({ state, jerseyCount: 1 })).toBeNull();
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
    expect(collection).toContain("collectionLoaded");
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
