/**
 * One-shot handoff from Send bud to the foreign UserJersey detail under it: the detail shows the
 * "Dit bud er sendt til handle" Toast once, on focus, not on every reload (docs/design-system.md →
 * Foreign UserJersey detail → After sending). Module state, because the two screens share no props
 * and the detail stays mounted under Send bud.
 */
let pending: { jerseyId: string; handle: string } | null = null;

export function rememberBidSent(jerseyId: string, handle: string): void {
  pending = { jerseyId, handle };
}

/** The Handle the bid went to, once; null when nothing is pending for this jersey. */
export function consumeBidSent(jerseyId: string): string | null {
  if (!pending || pending.jerseyId !== jerseyId) {
    return null;
  }
  const { handle } = pending;
  pending = null;
  return handle;
}

export function resetBidSentHandoff(): void {
  pending = null;
}
