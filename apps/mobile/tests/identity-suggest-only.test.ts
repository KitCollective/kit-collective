import { describe, expect, it } from "vitest";
import { buildSuggestOnlyVisionJob } from "../src/capture/identitySuggestOnly";

describe("buildSuggestOnlyVisionJob", () => {
  const baseJob = {
    jobId: "00000000-0000-0000-0000-000000000099",
    status: "ready" as const,
    suggestions: {
      clubId: "00000000-0000-0000-0000-000000000001",
      clubLabel: "FC Test",
      seasonId: "00000000-0000-0000-0000-000000000002",
      seasonLabel: "2024/25",
      type: "home" as const,
    },
    fieldPreselect: { club: true },
  };

  it("keeps suggest-only fields after partial preselect", () => {
    const narrowed = buildSuggestOnlyVisionJob(baseJob);
    expect(narrowed?.suggestions).toEqual({
      seasonId: "00000000-0000-0000-0000-000000000002",
      seasonLabel: "2024/25",
      type: "home",
    });
    expect(narrowed?.fieldPreselect).toBeUndefined();
  });

  it("returns null when every suggested field preselects", () => {
    expect(
      buildSuggestOnlyVisionJob({
        ...baseJob,
        fieldPreselect: { club: true, season: true, type: true },
      }),
    ).toBeNull();
  });

  it("omits manually edited fields from the banner", () => {
    const narrowed = buildSuggestOnlyVisionJob(baseJob, { season: true });
    expect(narrowed?.suggestions).toEqual({
      type: "home",
    });
  });
});
