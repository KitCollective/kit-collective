import type { CollectionJersey } from "@kit/api-contract";

export type OwnJerseyLoadOutcome =
  | { kind: "found"; jersey: CollectionJersey }
  | { kind: "not-found" }
  | { kind: "error" };

type FetchJerseys = () => Promise<{ jerseys: CollectionJersey[] }>;

// Duck-typed so this module never imports the API client (and its Expo config).
function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );
}

export async function loadOwnJersey(
  fetchJerseys: FetchJerseys,
  jerseyId: string,
): Promise<OwnJerseyLoadOutcome> {
  try {
    const response = await fetchJerseys();
    const jersey = response.jerseys.find((item) => item.id === jerseyId);
    return jersey ? { kind: "found", jersey } : { kind: "not-found" };
  } catch (error) {
    return isNotFoundError(error) ? { kind: "not-found" } : { kind: "error" };
  }
}
