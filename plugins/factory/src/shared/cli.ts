// CLI pieces more than one area uses.
import { PluginCliError } from "@get-bb/plugin-sdk";

export const json = { type: "boolean", description: "Emit machine-readable JSON" } as const;

/** Turns a rejected promise into a CLI failure with the error's own text. */
export const cliFailure =
  (code: string) =>
  (error: unknown): never => {
    throw new PluginCliError(error instanceof Error ? error.message : String(error), { code });
  };
