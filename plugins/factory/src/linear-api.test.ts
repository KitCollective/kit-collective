import { describe, expect, it } from "vitest";
import { withNote, writeWorkpadNote } from "./linear-api.js";

const workpad = [
  "## Workpad",
  "",
  "### Plan",
  "",
  "- a step",
  "",
  "### Notes",
  "",
  "- first note",
  "",
  "### Evidence",
  "",
  "- (none)",
  "",
].join("\n");

describe("withNote", () => {
  it("adds the line at the end of the Notes section and changes nothing else", () => {
    const next = withNote(workpad, "- second note");
    expect(next).toBe(workpad.replace("- first note\n", "- first note\n- second note\n"));
  });

  it("adds a Notes section at the end when the workpad has none", () => {
    expect(withNote("## Workpad\n\n### Plan\n\n- x\n", "- n")).toBe(
      "## Workpad\n\n### Plan\n\n- x\n\n### Notes\n\n- n\n",
    );
  });

  it("handles a Notes section that is the last one", () => {
    expect(withNote("## W\n\n### Notes\n\n- a\n\n", "- b")).toBe(
      "## W\n\n### Notes\n\n- a\n- b\n\n",
    );
  });
});

describe("writeWorkpadNote", () => {
  function fakeFetch(comments: { id: string; body: string }[]) {
    const bodies: { query: string; variables: Record<string, string> }[] = [];
    // SAFETY: the fake answers the only call shape writeWorkpadNote makes (a JSON POST); the rest of fetch is unused.
    const impl = (async (_url: unknown, init?: { body?: unknown }) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const data = body.query.includes("commentUpdate")
        ? { commentUpdate: { success: true } }
        : { issue: { comments: { nodes: comments } } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as typeof fetch;
    return { impl, bodies };
  }

  it("updates the comment that starts with the heading", async () => {
    const { impl, bodies } = fakeFetch([
      { id: "c1", body: "Max: claimed." },
      { id: "c2", body: workpad },
    ]);
    expect(await writeWorkpadNote("key", "issue-1", "## Workpad", "- n", impl)).toBe(true);
    expect(bodies[1]?.variables).toEqual({ id: "c2", body: withNote(workpad, "- n") });
  });

  it("returns false and writes nothing when the issue has no workpad", async () => {
    const { impl, bodies } = fakeFetch([{ id: "c1", body: "Max: claimed." }]);
    expect(await writeWorkpadNote("key", "issue-1", "## Workpad", "- n", impl)).toBe(false);
    expect(bodies).toHaveLength(1);
  });
});
