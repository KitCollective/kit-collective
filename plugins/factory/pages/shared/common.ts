// Constants and helpers several pages use.

/** The nav panel path of the Agents page; its Board and Runs views are sub-paths of it. */
export const PANEL = "agents";

export const field =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
