import type { CollectionJersey } from "@kit/api-contract";

export type OwnJerseyLoadOutcome =
  | { kind: "found"; jersey: CollectionJersey }
  | { kind: "not-found" }
  | { kind: "error" };

type FetchJerseys = () => Promise<{ jerseys: CollectionJersey[] }>;

export async function loadOwnJersey(
  fetchJerseys: FetchJerseys,
  jerseyId: string,
): Promise<OwnJerseyLoadOutcome> {
  try {
    const response = await fetchJerseys();
    const jersey = response.jerseys.find((item) => item.id === jerseyId);
    return jersey ? { kind: "found", jersey } : { kind: "not-found" };
  } catch {
    // The fetch is the whole own list, so any failure (a 404 included) is a failed load.
    // Only a successful list without the jersey proves it is gone.
    return { kind: "error" };
  }
}
