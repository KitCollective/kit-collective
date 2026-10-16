import type { CollectionJersey } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import { loadOwnJersey } from "../src/jersey-detail/own-jersey-load";

function jerseyStub(id: string): CollectionJersey {
  // SAFETY: loadOwnJersey only reads `id`; the other fields are never touched.
  return { id } as CollectionJersey;
}

function statusError(status: number): Error {
  return Object.assign(new Error("Kunne ikke hente samling"), { status });
}

describe("loadOwnJersey", () => {
  it("returns found when the jersey is in the list", async () => {
    const wanted = jerseyStub("jersey-2");
    const outcome = await loadOwnJersey(
      async () => ({ jerseys: [jerseyStub("jersey-1"), wanted] }),
      "jersey-2",
    );

    expect(outcome).toEqual({ kind: "found", jersey: wanted });
  });

  it("returns not-found when the jersey is absent from the list", async () => {
    const outcome = await loadOwnJersey(
      async () => ({ jerseys: [jerseyStub("jersey-1")] }),
      "jersey-2",
    );

    expect(outcome).toEqual({ kind: "not-found" });
  });

  it("returns not-found when the API answers 404", async () => {
    const outcome = await loadOwnJersey(async () => {
      throw statusError(404);
    }, "jersey-2");

    expect(outcome).toEqual({ kind: "not-found" });
  });

  it.each([401, 500, 503])("returns error when the API answers %i", async (status) => {
    const outcome = await loadOwnJersey(async () => {
      throw statusError(status);
    }, "jersey-2");

    expect(outcome).toEqual({ kind: "error" });
  });

  it("returns error on a network failure", async () => {
    const outcome = await loadOwnJersey(async () => {
      throw new TypeError("Network request failed");
    }, "jersey-2");

    expect(outcome).toEqual({ kind: "error" });
  });

  it("returns error on any other throw such as a schema parse failure", async () => {
    const outcome = await loadOwnJersey(async () => {
      throw new Error("invalid_type at jerseys[0].id");
    }, "jersey-2");

    expect(outcome).toEqual({ kind: "error" });
  });
});
