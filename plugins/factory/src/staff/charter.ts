// A Staff member's Charter: `staff/<agent id>.md` in the agent's project, with a frontmatter that
// gives the title, the Heartbeat, the model and, when there is one, the budget. An agent that has a Charter is
// Staff (CONTEXT.md: Staff, Charter). Only top-level `key: value` lines are read; there is no YAML
// dependency and the Charter's nested `limits:` block is not needed here.

export interface Charter {
  title: string;
  heartbeat: string | null;
  /** The budget the Charter states, as written; null when it states none. */
  budget: string | null;
  /** The model the Charter names for the member's threads; null when it names none. */
  model: string | null;
}

/** The path of an agent's Charter in its project. */
export const charterPath = (agentId: string) => `staff/${agentId}.md`;

/** The Charter in `text`, or null when it has no frontmatter or no title. */
export function parseCharter(text: string): Charter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) return null;
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const field = /^([A-Za-z_][\w-]*):[ \t]+(.*)$/.exec(line);
    if (field === null) continue;
    // A trailing ` # comment` is not part of the value.
    const value = (field[2] ?? "").replace(/\s+#.*$/, "").trim();
    if (value !== "") fields.set(field[1] ?? "", value);
  }
  const title = fields.get("title");
  if (title === undefined) return null;
  return {
    title,
    heartbeat: fields.get("heartbeat") ?? null,
    budget: fields.get("budget") ?? null,
    model: fields.get("model") ?? null,
  };
}
