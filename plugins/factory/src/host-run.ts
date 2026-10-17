// Runs a repo script in a directory on this machine. Used only by the host bundle.
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ScriptResult } from "./host-contract.js";

const OUTPUT_LIMIT = 64 * 1024;

/** The last non-empty line of the output, trimmed. */
export function lastLine(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return (lines[lines.length - 1] ?? "").trim();
}

export function runNodeScript(options: {
  cwd: string;
  script: string;
  /** Arguments after the script. The caller validates them; there is no shell. */
  args?: string[];
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<ScriptResult> {
  const { cwd, script, timeoutMs, signal } = options;
  const scriptArgs = options.args ?? [];
  if (!isAbsolute(cwd)) throw new Error(`cwd must be an absolute path, got "${cwd}"`);
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`no directory at ${cwd}`);
  if (!existsSync(join(cwd, script))) throw new Error(`${script} does not exist in ${cwd}`);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1" },
      ...(signal === undefined ? {} : { signal }),
      timeout: timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    const keep = (current: string, chunk: Buffer) =>
      (current + chunk.toString("utf8")).slice(-OUTPUT_LIMIT);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = keep(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = keep(stderr, chunk);
    });
    child.on("error", reject);
    child.on("close", (code, killedBy) => {
      resolve({
        // A script killed by a signal (the timeout) has no code: report it as 128 + 15, as a shell would.
        exitCode: code ?? (killedBy === null ? 1 : 143),
        lastLine: lastLine(stdout) || lastLine(stderr),
        hostname: hostname(),
        cwd,
        durationMs: Date.now() - started,
      });
    });
  });
}
