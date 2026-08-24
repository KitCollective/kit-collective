/**
 * Worker boot env (KIT-53). Secret names only — values live on the CX33 box.
 * DATABASE_URL is forbidden so this host cannot reach product Postgres.
 */

export const LINEAR_CLI_PIN = {
  npmPackage: "@schpet/linear-cli",
  version: "2.5.0",
};

export const WORKER_SECRET_NAMES = [
  "CURSOR_API_KEY",
  "LINEAR_API_KEY",
  "LINEAR_WEBHOOK_SECRET",
  "GH_TOKEN",
];

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {true}
 */
export function assertWorkerEnv(env = process.env) {
  if (typeof env.DATABASE_URL === "string" && env.DATABASE_URL.length > 0) {
    throw new Error("DATABASE_URL must be absent on the PI worker");
  }
  const missing = WORKER_SECRET_NAMES.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`missing worker secrets: ${missing.join(", ")}`);
  }
  const pinned = env.LINEAR_CLI_VERSION;
  if (typeof pinned === "string" && pinned.length > 0 && pinned !== LINEAR_CLI_PIN.version) {
    throw new Error(
      `LINEAR_CLI_VERSION ${pinned} does not match pin ${LINEAR_CLI_PIN.npmPackage}@${LINEAR_CLI_PIN.version}`,
    );
  }
  return true;
}
