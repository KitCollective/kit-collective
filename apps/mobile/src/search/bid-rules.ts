/**
 * Pure bid rules for Søg and Send bud. Started in KIT-290 with the dock of a foreign UserJersey;
 * the own pending bid and the amount rules join it in later slices.
 */

/** What the foreign UserJersey detail dock holds: Send bud, or no dock at all. */
export type PeerJerseyDockState = "send" | "none";

/**
 * docs/design-system.md → Foreign UserJersey detail → Button dock. A jersey that is åben for bud
 * docks Send bud. One that is not has no dock for now: the later Skriv til handle control is
 * KIT-298 (decided 2026-10-10 in the issue comments), and Send bud is never offered on it.
 */
export function peerJerseyDockState(input: { biddingEnabled: boolean }): PeerJerseyDockState {
  return input.biddingEnabled ? "send" : "none";
}
