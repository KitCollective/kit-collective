/** The lock lists failed states as a gap; this line is provisional. */
export const TRIAL_START_FAILED_MESSAGE = "Prøven kunne ikke starte. Prøv igen.";

export type TrialStartResult<Profile> =
  | { status: "started"; profile: Profile }
  | { status: "failed"; message: string };

/** The one path that starts the Nest-trial: the paywall's **Start gratis prøve** button. */
export async function startTrialFromPaywall<Profile>(deps: {
  startTrial: () => Promise<unknown>;
  refreshProfile: () => Promise<Profile>;
}): Promise<TrialStartResult<Profile>> {
  try {
    await deps.startTrial();
    return { status: "started", profile: await deps.refreshProfile() };
  } catch {
    return { status: "failed", message: TRIAL_START_FAILED_MESSAGE };
  }
}
