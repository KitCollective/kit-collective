import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import host, { runProbe } from "../host.js";
import plugin from "../server.js";
import { hostContract, PROBE_SCRIPT } from "./host-contract.js";
import { type ProbeDeps, probeThread } from "./host-probe.js";
import { lastLine, runNodeScript } from "./host-run.js";

const worktree = fileURLToPath(new URL("../../..", import.meta.url));
const temps: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "factory-host-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("runNodeScript", () => {
  it("returns the exit code and the last non-empty line", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "s.mjs"), 'console.log("one");\nconsole.log("two\\n\\n");\n');
    const result = await runNodeScript({ cwd, script: "s.mjs", timeoutMs: 10_000 });
    expect(result).toMatchObject({ exitCode: 0, lastLine: "two", cwd });
    expect(result.hostname).not.toBe("");
  });

  it("reports a failing script's code and falls back to stderr", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "s.mjs"), 'console.error("boom");\nprocess.exit(3);\n');
    expect(await runNodeScript({ cwd, script: "s.mjs", timeoutMs: 10_000 })).toMatchObject({
      exitCode: 3,
      lastLine: "boom",
    });
  });

  it("stops a script that outlives its timeout", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "s.mjs"), "setTimeout(() => {}, 60_000);\n");
    const result = await runNodeScript({ cwd, script: "s.mjs", timeoutMs: 200 });
    expect(result.exitCode).toBe(143);
  });

  it("refuses a relative or missing directory and a missing script", () => {
    expect(() => runNodeScript({ cwd: "rel", script: "s.mjs", timeoutMs: 1 })).toThrow(/absolute/);
    expect(() => runNodeScript({ cwd: "/nonexistent-dir", script: "s.mjs", timeoutMs: 1 })).toThrow(
      /no directory/,
    );
    expect(() => runNodeScript({ cwd: tempDir(), script: "s.mjs", timeoutMs: 1 })).toThrow(
      /does not exist/,
    );
  });

  it("takes the last line, ignoring trailing blank lines", () => {
    expect(lastLine("a\r\nb\r\n\r\n")).toBe("b");
    expect(lastLine("")).toBe("");
  });
});

describe("the host entry", () => {
  it("runs only the fixed probe script, in the directory it is given", async () => {
    expect(host.contract).toBe(hostContract);
    const result = await runProbe({ cwd: worktree }, { signal: new AbortController().signal });
    expect(result).toMatchObject({ exitCode: 0, cwd: worktree });
    expect(result).toMatchObject({
      lastLine: expect.stringMatching(/^host-probe ok branch=\S+ head=[0-9a-f]+$/),
    });
    expect(PROBE_SCRIPT).toBe("plugins/factory/scripts/host-probe.mjs");
  });

  it("accepts no script from the caller", async () => {
    const input = hostContract.run_probe.input["~standard"];
    expect(await input.validate({ cwd: "/x", script: "other.mjs" })).toHaveProperty("issues");
  });
});

describe("probeThread", () => {
  const result = {
    exitCode: 0,
    lastLine: "host-probe ok branch=b head=abc",
    hostname: "m",
    cwd: "/w",
    durationMs: 5,
  };
  const deps = (over: Partial<ProbeDeps> = {}): ProbeDeps => ({
    threadEnvironment: async () => "env_1",
    environment: async () => ({ hostId: "host_1", path: "/w" }),
    runProbe: async () => result,
    ...over,
  });

  it("runs the script on the thread's machine in its worktree", async () => {
    const calls: unknown[][] = [];
    const record = await probeThread(
      deps({
        runProbe: async (...args) => {
          calls.push(args);
          return result;
        },
      }),
      "thr_1",
    );
    expect(calls).toEqual([["host_1", "/w"]]);
    expect(record).toEqual({ threadId: "thr_1", hostId: "host_1", ...result });
  });

  it("says why a thread cannot be probed", async () => {
    await expect(
      probeThread(deps({ threadEnvironment: async () => null }), "thr_1"),
    ).rejects.toThrow(/no environment/);
    await expect(
      probeThread(deps({ environment: async () => ({ hostId: "h", path: null }) }), "thr_1"),
    ).rejects.toThrow(/no directory/);
  });
});

describe("the plugin", () => {
  it("exposes the probe as a CLI command and an agent tool through the host client", async () => {
    const fake = createFakePluginHost({
      pluginId: "optio",
      agentSkillIds: ["optio"],
      sdk: {
        threads: {
          get: async () => ({ environmentId: "env_1", status: "active", archivedAt: null }),
        },
        environments: { get: async () => ({ hostId: "host_9", path: "/work/tree" }) },
      },
      experimental_callHostRpc: async (call) => ({
        exitCode: 0,
        lastLine: `ran ${call.method}`,
        hostname: "harness",
        // SAFETY: the fake host validated the input against run_probe's schema before this call.
        cwd: (call.input as { cwd: string }).cwd,
        durationMs: 1,
      }),
    });
    await plugin(fake.bb);
    const cli = await fake.harness.behavior.runCli(["host-probe", "thr_7", "--json"]);
    expect(cli.exitCode).toBe(0);
    expect(JSON.parse(cli.stdout ?? "")).toMatchObject({
      threadId: "thr_7",
      hostId: "host_9",
      lastLine: "ran run_probe",
    });
    expect(fake.harness.inspection.experimental_hostRpcCalls).toMatchObject([
      { method: "run_probe", hostId: "host_9", input: { cwd: "/work/tree" } },
    ]);
    expect(fake.harness.registrations.agentTools.map((tool) => tool.name)).toContain(
      "factory_host_probe",
    );
  });
});
