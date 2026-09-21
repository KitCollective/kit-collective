import { describe, expect, it } from "vitest";
import type { ConfirmSectionFact } from "../src/capture/confirmSectionProgress";
import {
  attachConfirmVisionFieldMarks,
  resolveConfirmVisionFieldMark,
  type ConfirmVisionFieldMarkInput,
} from "../src/capture/confirmVisionFieldMarks";

const idle: ConfirmVisionFieldMarkInput = {
  identityCompleted: false,
  analyzing: false,
  reviewed: false,
  catalogMiss: false,
  dismissed: false,
  fieldPreselect: {},
  suggestions: null,
  edited: { club: false, season: false, type: false, player: false },
};

describe("confirm Vision field marks", () => {
  it("stays unmarked until identity has run — grouping is not a Data mark", () => {
    expect(resolveConfirmVisionFieldMark("club", idle)).toBeUndefined();
    expect(resolveConfirmVisionFieldMark("season", idle)).toBeUndefined();
    expect(resolveConfirmVisionFieldMark("type", idle)).toBeUndefined();
    expect(resolveConfirmVisionFieldMark("player", idle)).toBeUndefined();
  });

  it("puts a pending sparkle on every Data field while identity runs", () => {
    const input: ConfirmVisionFieldMarkInput = { ...idle, analyzing: true };
    expect(resolveConfirmVisionFieldMark("club", input)).toBe("pending");
    expect(resolveConfirmVisionFieldMark("season", input)).toBe("pending");
    expect(resolveConfirmVisionFieldMark("type", input)).toBe("pending");
    expect(resolveConfirmVisionFieldMark("player", input)).toBe("pending");
  });

  it("puts an eye on a Vision hit until the collector opens Data", () => {
    const input: ConfirmVisionFieldMarkInput = {
      ...idle,
      identityCompleted: true,
      fieldPreselect: { club: true, season: true, type: true },
      suggestions: {
        clubId: "club",
        seasonId: "season",
        type: "home",
      },
    };

    expect(resolveConfirmVisionFieldMark("club", input)).toBe("review");
    expect(resolveConfirmVisionFieldMark("season", input)).toBe("review");
    expect(resolveConfirmVisionFieldMark("type", input)).toBe("review");
    expect(resolveConfirmVisionFieldMark("player", input)).toBe("miss");
  });

  it("turns the eye into a check after the collector has looked at Data", () => {
    const input: ConfirmVisionFieldMarkInput = {
      ...idle,
      identityCompleted: true,
      reviewed: true,
      fieldPreselect: { club: true, player: true },
      suggestions: { clubId: "club", playerId: "player" },
    };

    expect(resolveConfirmVisionFieldMark("club", input)).toBe("hit");
    expect(resolveConfirmVisionFieldMark("player", input)).toBe("hit");
    expect(resolveConfirmVisionFieldMark("season", input)).toBe("miss");
  });

  it("marks a miss when identity ran and that field has no catalog hit", () => {
    const input: ConfirmVisionFieldMarkInput = {
      ...idle,
      identityCompleted: true,
      catalogMiss: true,
    };

    expect(resolveConfirmVisionFieldMark("club", input)).toBe("miss");
    expect(resolveConfirmVisionFieldMark("season", input)).toBe("miss");
    expect(resolveConfirmVisionFieldMark("type", input)).toBe("miss");
    expect(resolveConfirmVisionFieldMark("player", input)).toBe("miss");
  });

  it("treats a collector override as rejected — not a fail, not a check", () => {
    const input: ConfirmVisionFieldMarkInput = {
      ...idle,
      identityCompleted: true,
      reviewed: true,
      fieldPreselect: { club: true, season: true },
      suggestions: { clubId: "club", seasonId: "season" },
      edited: { club: true, season: false, type: false, player: false },
    };

    expect(resolveConfirmVisionFieldMark("club", input)).toBe("rejected");
    expect(resolveConfirmVisionFieldMark("season", input)).toBe("hit");
  });

  it("treats dismiss of a suggest-only strip as rejected on those fields", () => {
    const input: ConfirmVisionFieldMarkInput = {
      ...idle,
      identityCompleted: true,
      dismissed: true,
      suggestions: { clubId: "club", type: "home" },
    };

    expect(resolveConfirmVisionFieldMark("club", input)).toBe("rejected");
    expect(resolveConfirmVisionFieldMark("type", input)).toBe("rejected");
    expect(resolveConfirmVisionFieldMark("season", input)).toBe("miss");
  });

  it("attaches marks only onto Data capsules, leaving Detaljer alone", () => {
    const facts: ConfirmSectionFact[] = [
      { key: "club", placeholder: "Klub", value: "Toulouse" },
      { key: "season", placeholder: "Sæson", value: null },
      { key: "size", placeholder: "Størrelse", value: null },
    ];
    const marked = attachConfirmVisionFieldMarks(facts, {
      ...idle,
      identityCompleted: true,
      fieldPreselect: { club: true },
      suggestions: { clubId: "club" },
    });

    expect(marked[0]?.visionMark).toBe("review");
    expect(marked[1]?.visionMark).toBe("miss");
    expect(marked[2]?.visionMark).toBeUndefined();
  });
});
