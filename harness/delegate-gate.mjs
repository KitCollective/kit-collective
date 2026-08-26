/**
 * Factory delegate gate (KIT-74).
 * Accepts Pi, the installed app display name Pi Bot Agent, and/or LINEAR_PI_APP_USER_ID.
 */

export const PI_BOT_AGENT_NAME = "Pi Bot Agent";
export const DEFAULT_DELEGATE_NAMES = ["Pi", PI_BOT_AGENT_NAME];

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createDelegateGateConfig(env = {}) {
  const appUserId =
    typeof env.LINEAR_PI_APP_USER_ID === "string" && env.LINEAR_PI_APP_USER_ID.length > 0
      ? env.LINEAR_PI_APP_USER_ID
      : undefined;
  return {
    names: [...DEFAULT_DELEGATE_NAMES],
    appUserId,
  };
}

/**
 * @param {{ name?: string, id?: string } | null | undefined} delegate
 * @param {{ names: string[], appUserId?: string }} config
 * @returns {"none" | "pi" | "blocked"}
 */
export function delegateGate(delegate, config) {
  const name = delegate?.name;
  const id = delegate?.id;

  if (typeof id === "string" && typeof config.appUserId === "string" && id === config.appUserId) {
    return "pi";
  }

  if (typeof name !== "string" || name.length === 0) {
    return "none";
  }

  const needle = name.toLowerCase();
  if (config.names.some((allowed) => allowed.toLowerCase() === needle)) {
    return "pi";
  }

  return "blocked";
}
