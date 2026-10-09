/** Key-value storage the prompt flag lives in. The app wires SecureStore; tests pass a map. */
export type PromptStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

const DISMISSED = "dismissed";

export function profilePromptKey(userId: string): string {
  return `kit.profilePromptDismissed.${userId}`;
}

/**
 * True when the collector dismissed the prompt. A storage failure also reads as
 * dismissed: a prompt that cannot remember its dismissal must not nag.
 */
export async function isProfilePromptDismissed(
  store: PromptStore,
  userId: string,
): Promise<boolean> {
  try {
    return (await store.get(profilePromptKey(userId))) === DISMISSED;
  } catch {
    return true;
  }
}

export async function dismissProfilePrompt(store: PromptStore, userId: string): Promise<void> {
  try {
    await store.set(profilePromptKey(userId), DISMISSED);
  } catch {
    // The caller hides the prompt for this visit either way.
  }
}

/** The prompt appears once the first jersey is saved, until it is dismissed. */
export function shouldShowProfilePrompt(input: {
  jerseyCount: number;
  dismissed: boolean | null;
}): boolean {
  return input.dismissed === false && input.jerseyCount >= 1;
}
