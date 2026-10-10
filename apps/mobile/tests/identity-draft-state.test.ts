import type { VisionJobResponse } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  EMPTY_IDENTITY_DRAFT_STATE,
  type IdentityDraftStates,
  identityLandingPatch,
  identityStateFor,
  landingFadesIn,
  patchIdentityState,
  resetIdentityState,
} from "../src/capture/identityDraftState";

const guessA: VisionJobResponse = { jobId: "job-a", status: "ready" };
const guessB: VisionJobResponse = { jobId: "job-b", status: "ready" };

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

describe("a Vision result that lands while another jersey is open", () => {
  it("stores the low-confidence guess under the jersey that owns the job", () => {
    // A's read lands while the collector is on B: the patch is for A, the fade is not.
    const states = patchIdentityState(
      {},
      "draft-a",
      identityLandingPatch({ kind: "suggest", job: guessA }),
    );
    expect(landingFadesIn("draft-a", "draft-b")).toBe(false);
    expect(identityStateFor(states, "draft-a").suggestion).toBe(guessA);
    expect(identityStateFor(states, "draft-b").suggestion).toBeNull();
  });

  it("marks a background jersey as filled by Vision without touching the visible one", () => {
    const states = patchIdentityState({}, "draft-a", identityLandingPatch({ kind: "applied" }));
    expect(identityStateFor(states, "draft-a").applied).toBe(true);
    expect(identityStateFor(states, "draft-b").applied).toBe(false);
  });

  it("fades in only for the visible jersey", () => {
    expect(landingFadesIn("draft-a", "draft-a")).toBe(true);
    expect(landingFadesIn("draft-a", null)).toBe(false);
  });

  it("keeps the guess for A when it is reopened", () => {
    let states = patchIdentityState(
      {},
      "draft-a",
      identityLandingPatch({ kind: "suggest", job: guessA }),
    );
    states = patchIdentityState(states, "draft-b", identityLandingPatch({ kind: "applied" }));
    expect(identityStateFor(states, "draft-a").suggestion).toBe(guessA);
  });
});
