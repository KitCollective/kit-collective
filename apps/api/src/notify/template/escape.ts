const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Safe for both text nodes and double-quoted attributes. */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}
