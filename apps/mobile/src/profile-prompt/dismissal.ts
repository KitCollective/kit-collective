/** Key-value storage the prompt flag lives in. The app wires SecureStore; tests pass a map. */
export type PromptStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

const WAITING = "waiting";
const ARMED = "armed";
const DISMISSED = "dismissed";

/**
 * none: not seen yet. waiting: first seen with an empty Samling, so the first jersey is still to
 * come. armed: the first jersey was saved and the prompt is owed. dismissed: done.
 */
export type ProfilePromptState = "none" | "waiting" | "armed" | "dismissed";

export function profilePromptKey(userId: string): string {
  return `kit.profilePromptDismissed.${userId}`;
}

/**
 * A storage failure reads as dismissed: a prompt that cannot remember its state must not nag.
 */
export async function readProfilePromptState(
  store: PromptStore,
  userId: string,
): Promise<ProfilePromptState> {
  try {
    const value = await store.get(profilePromptKey(userId));
    if (value === DISMISSED) {
      return "dismissed";
    }
    if (value === ARMED) {
      return "armed";
    }
    return value === WAITING ? "waiting" : "none";
  } catch {
    return "dismissed";
  }
}

/** Persists `waiting` or `armed`. Returns false when storage fails, so nothing is shown. */
export async function storeProfilePromptState(
  store: PromptStore,
  userId: string,
  state: "waiting" | "armed",
): Promise<boolean> {
  try {
    await store.set(profilePromptKey(userId), state === "armed" ? ARMED : WAITING);
    return true;
  } catch {
    return false;
  }
}

export async function dismissProfilePrompt(store: PromptStore, userId: string): Promise<void> {
  try {
    await store.set(profilePromptKey(userId), DISMISSED);
  } catch {
    // The caller hides the prompt for this visit either way.
  }
}

/**
 * The next stored state, or null for no change. Arming happens at the real first save, never by
 * guessing from a count alone:
 * - nothing moves until the collection was actually loaded (a failed fetch is not "empty");
 * - a collection first seen empty waits for its first jersey;
 * - an arrival from the first session arms only when the collection is exactly the jerseys saved
 *   in that session, so a collector who already had jerseys is never told theirs was the first.
 */
export function nextProfilePromptState(input: {
  state: ProfilePromptState | null;
  collectionLoaded: boolean;
  jerseyCount: number;
  savedInFirstSession: number;
}): "waiting" | "armed" | null {
  if (!input.collectionLoaded) {
    return null;
  }
  if (input.state === "waiting") {
    return input.jerseyCount >= 1 ? "armed" : null;
  }
  if (input.state !== "none") {
    return null;
  }
  if (input.jerseyCount === 0) {
    return "waiting";
  }
  const savedAll = input.savedInFirstSession > 0 && input.jerseyCount === input.savedInFirstSession;
  return savedAll ? "armed" : null;
}

export function shouldShowProfilePrompt(input: {
  jerseyCount: number;
  state: ProfilePromptState | null;
}): boolean {
  return input.state === "armed" && input.jerseyCount >= 1;
}
