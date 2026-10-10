import type { VisionJobResponse } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  EMPTY_IDENTITY_DRAFT_STATE,
  type IdentityDraftStates,
  identityStateFor,
  patchIdentityState,
  resetIdentityState,
} from "../src/capture/identityDraftState";

const guessA = { jobId: "job-a", status: "ready" } as unknown as VisionJobResponse;
const guessB = { jobId: "job-b", status: "ready" } as unknown as VisionJobResponse;

describe("identity state per jersey", () => {
  it("gives a jersey Vision has not touched the empty state", () => {
    expect(identityStateFor({}, "draft-a")).toBe(EMPTY_IDENTITY_DRAFT_STATE);
    expect(identityStateFor({}, null)).toBe(EMPTY_IDENTITY_DRAFT_STATE);
  });

  it("keeps A's pending guess intact while B's read starts and lands, and A is reopened", () => {
    let states: IdentityDraftStates = {};
    // A's read settles with a low-confidence guess and a catalog miss.
    states = patchIdentityState(states, "draft-a", {
      suggestion: guessA,
      catalogMiss: true,
      catalogMissHint: "hint-a",
    });
    // The collector switches to B. B's read starts: only B's entry is forgotten.
    states = resetIdentityState(states, "draft-b");
    expect(identityStateFor(states, "draft-b")).toBe(EMPTY_IDENTITY_DRAFT_STATE);
    // B's guess arrives.
    states = patchIdentityState(states, "draft-b", { suggestion: guessB });

    expect(identityStateFor(states, "draft-b").suggestion).toBe(guessB);
    expect(identityStateFor(states, "draft-b").catalogMiss).toBe(false);
    // Back to A: its guess, miss flag and hint are exactly as they were.
    const a = identityStateFor(states, "draft-a");
    expect(a.suggestion).toBe(guessA);
    expect(a.catalogMiss).toBe(true);
    expect(a.catalogMissHint).toBe("hint-a");
  });

  it("shows no catalog miss on B after A's miss", () => {
    const states = patchIdentityState({}, "draft-a", { catalogMiss: true });
    expect(identityStateFor(states, "draft-a").catalogMiss).toBe(true);
    expect(identityStateFor(states, "draft-b").catalogMiss).toBe(false);
  });

  it("applying on one jersey changes only that jersey", () => {
    let states = patchIdentityState({}, "draft-a", { suggestion: guessA });
    states = patchIdentityState(states, "draft-b", { suggestion: guessB });
    states = patchIdentityState(states, "draft-b", {
      suggestion: null,
      applied: true,
      catalogMiss: false,
      catalogMissHint: null,
    });
    expect(identityStateFor(states, "draft-b").applied).toBe(true);
    expect(identityStateFor(states, "draft-b").suggestion).toBeNull();
    expect(identityStateFor(states, "draft-a").suggestion).toBe(guessA);
    expect(identityStateFor(states, "draft-a").applied).toBe(false);
  });

  it("does not change its input", () => {
    const before: IdentityDraftStates = { "draft-a": { ...EMPTY_IDENTITY_DRAFT_STATE } };
    patchIdentityState(before, "draft-a", { applied: true });
    resetIdentityState(before, "draft-a");
    expect(before["draft-a"]?.applied).toBe(false);
  });
});
