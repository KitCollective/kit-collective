import { describe, expect, it } from "vitest";
import { buildPeekHtml } from "../src/catalog/catalog-peek.js";

describe("buildPeekHtml", () => {
  it("escapes club names and omits image tags", () => {
    const html = buildPeekHtml(
      [
        {
          seasonId: "season-1",
          seasonLabel: "2024/25",
          clubId: "club-1",
          clubName: "<script>alert(1)</script>",
          squadCount: 1,
        },
      ],
      [
        {
          clubId: "club-1",
          seasonId: "season-1",
          kitType: "home",
          photoCount: 1,
        },
      ],
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });
});
