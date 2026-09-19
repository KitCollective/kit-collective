import { describe, expect, it } from "vitest";
import { parseSeedCliArgs } from "../src/cli-args.js";

describe("parseSeedCliArgs", () => {
  it("parses competition and season range with default development lane", () => {
    const result = parseSeedCliArgs(["superligaen", "0001", "2025/26"]);
    expect(result).toEqual({
      ok: true,
      args: {
        competition: "superligaen",
        fromSeason: "0001",
        toSeason: "2025/26",
        lane: "development",
      },
    });
  });

  it("accepts explicit staging lane", () => {
    const result = parseSeedCliArgs(["championship", "2018/19", "2024/25", "staging"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.args.lane).toBe("staging");
    }
  });

  it("rejects production lane", () => {
    const result = parseSeedCliArgs(["superligaen", "0001", "today", "production"]);
    expect(result.ok).toBe(false);
  });

  it("rejects wrong arity", () => {
    expect(parseSeedCliArgs(["only-one"]).ok).toBe(false);
    expect(parseSeedCliArgs(["a", "b", "c", "d", "e"]).ok).toBe(false);
  });
});
