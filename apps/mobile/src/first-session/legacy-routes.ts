/**
 * The collector app has no login, register, reset, reset-complete or verify screen any more
 * (First session 1.0). A deep link or stored route that still points at one opens the Kom i gang
 * sheet on the first-session host instead of a dead end.
 */
const LEGACY_AUTH_SEGMENTS = new Set(["login", "register", "reset", "reset-complete", "verify"]);

/** Query value the first-session host reads to open Kom i gang straight away. */
export const LEGACY_DOOR_PARAM_VALUE = "1";

export function isLegacyAuthPath(pathname: string): boolean {
  const [path = ""] = pathname.split("?");
  const segments = path.split("/").filter((segment) => segment !== "" && segment !== "(auth)");
  return segments.length === 1 && LEGACY_AUTH_SEGMENTS.has(segments[0] ?? "");
}
