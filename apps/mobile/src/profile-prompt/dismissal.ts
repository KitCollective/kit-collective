/** Key-value storage the prompt flag lives in. The app wires SecureStore; tests pass a map. */
export type PromptStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

const ARMED = "armed";
const DISMISSED = "dismissed";

/** none: never offered. armed: the first jersey was saved and the prompt is owed. dismissed: done. */
export type ProfilePromptState = "none" | "armed" | "dismissed";

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
    return value === ARMED ? "armed" : "none";
  } catch {
    return "dismissed";
  }
}

/** Marks the first saved jersey: the prompt is shown from now until it is dismissed. */
export async function armProfilePrompt(store: PromptStore, userId: string): Promise<boolean> {
  try {
    await store.set(profilePromptKey(userId), ARMED);
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
 * The first save arms the prompt: a collector arriving from the first session with a saved
 * jersey, or one whose only jersey is the first. Collectors who already had a collection are
 * never armed, so they are not told their first jersey was just saved.
 */
export function shouldArmProfilePrompt(input: {
  state: ProfilePromptState | null;
  jerseyCount: number;
  arrivedWithSavedJersey: boolean;
}): boolean {
  if (input.state !== "none") {
    return false;
  }
  return input.arrivedWithSavedJersey ? input.jerseyCount >= 1 : input.jerseyCount === 1;
}

export function shouldShowProfilePrompt(input: {
  jerseyCount: number;
  state: ProfilePromptState | null;
}): boolean {
  return input.state === "armed" && input.jerseyCount >= 1;
}
