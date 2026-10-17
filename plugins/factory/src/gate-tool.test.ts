import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gateWaitSeconds, prHead, runGate } from "../host.js";
import plugin from "../server.js";
import type { GateRun } from "./gate-store.js";
import { validateGateCall } from "./gate-tool.js";
import { GATE_CALL_TIMEOUT_MS, GATE_SCRIPT, hostContract } from "./host-contract.js";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repo with one commit and a stub gate script. */
function stubRepo(script: string): { dir: string; sha: string } {
  const dir = mkdtempSync(join(tmpdir(), "optio-gate-"));
  temps.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  mkdirSync(join(dir, "scripts"));
  writeFileSync(join(dir, GATE_SCRIPT), script);
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "stub");
  return { dir, sha: git("rev-parse", "HEAD").trim() };
}

const gateResult = {
  exitCode: 1,
  lastLine: "GATE review closed: checks red",
  hostname: "harness",
  cwd: "/work/tree",
  durationMs: 4,
  sha: "a".repeat(40),
};

async function pluginWith(callHost: (call: { method: string; input: unknown }) => unknown) {
  const fake = createFakePluginHost({
    pluginId: "optio",
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        get: async ({ threadId }: { threadId: string }) => ({
          environmentId: threadId === "thr_bare" ? null : "env_1",
          status: "active",
          archivedAt: null,
        }),
      },
      environments: { get: async () => ({ hostId: "host_9", path: "/work/tree" }) },
    },
    experimental_callHostRpc: async (call) => callHost(call),
  });
  await plugin(fake.bb);
  const gates = async () => {
    const cli = await fake.harness.behavior.runCli(["gates", "--json"]);
    // SAFETY: `gates --json` prints the store's GateRun rows as a JSON array.
    return JSON.parse(cli.stdout ?? "[]") as GateRun[];
  };
  return { fake, gates };
}

/** A tool result is a string or a content object; read both the same way. */
function toolResult(result: unknown): { isError: boolean; text: string } {
  if (typeof result === "string") return { isError: false, text: result };
  // SAFETY: the tool returns `{ content: [{ type: "text", text }], isError? }`.
  const object = result as { content: { text: string }[]; isError?: boolean };
  return { isError: object.isError === true, text: object.content[0]?.text ?? "" };
}

describe("validateGateCall", () => {
  it("accepts a known gate with a PR number and an issue key", () => {
    expect(validateGateCall({ gate: "review", pr: 12, issue: "ABC-3" })).toEqual({
      ok: true,
      call: { gate: "review", pr: 12, issue: "ABC-3" },
    });
    expect(validateGateCall({ gate: "land", pr: "7", issue: "ABC-363" })).toMatchObject({
      ok: true,
    });
  });

  it.each([
    [{ gate: "deploy", pr: 1, issue: "ABC-1" }, /unknown gate/],
    [{ gate: "result", pr: 1, issue: "ABC-1" }, /unknown gate/],
    [{ gate: "review", pr: -1, issue: "ABC-1" }, /pr/],
    [{ gate: "review", pr: "1;rm", issue: "ABC-1" }, /pr/],
    [{ gate: "review", pr: 1.5, issue: "ABC-1" }, /pr/],
    [{ gate: "review", pr: 1, issue: "abc" }, /issue/],
    [{ gate: "review", pr: 1, issue: "ABC-1 --x" }, /issue/],
    [{ gate: "review", issue: "ABC-1" }, /pr/],
    [{ gate: "review", pr: 1 }, /issue/],
    [{ pr: 1, issue: "ABC-1" }, /gate/],
  ])("refuses %j", (raw, reason) => {
    const result = validateGateCall(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });
});

describe("optio_gate", () => {
  it("refuses and records an unknown gate or a bad argument, and never reaches the host", async () => {
    const { fake, gates } = await pluginWith(() => gateResult);
    const bad = [
      { gate: "deploy", pr: 1, issue: "ABC-1" },
      { gate: "review", pr: -1, issue: "ABC-1" },
      { gate: "review", pr: "1;rm", issue: "ABC-1" },
      { gate: "review", pr: 1, issue: "abc" },
    ];
    for (const params of bad) {
      const result = toolResult(
        await fake.harness.behavior.callAgentTool("optio_gate", params, {
          threadId: "thr_1",
        }),
      );
      expect(result.isError).toBe(true);
    }
    expect(fake.harness.inspection.experimental_hostRpcCalls).toEqual([]);
    const rows = await gates();
    expect(rows).toHaveLength(bad.length);
    // Newest first.
    expect(rows[0]).toMatchObject({ outcome: "refused", threadId: "thr_1", issue: "abc" });
    expect(rows[bad.length - 1]).toMatchObject({ gate: "deploy" });
    expect(rows.every((row) => row.outcome === "refused" && row.exitCode === null)).toBe(true);
  });

  it("runs the gate on the thread's machine and records the exit code, verdict line, sha, gate and thread", async () => {
    const { fake, gates } = await pluginWith(() => gateResult);
    const result = toolResult(
      await fake.harness.behavior.callAgentTool(
        "optio_gate",
        { gate: "review", pr: 12, issue: "ABC-3" },
        { threadId: "thr_1" },
      ),
    );
    expect(result.isError).toBe(false);
    const returned = JSON.parse(result.text);
    expect(returned).toMatchObject({
      outcome: "ran",
      gate: "review",
      pr: 12,
      issue: "ABC-3",
      threadId: "thr_1",
      exitCode: 1,
      verdictLine: "GATE review closed: checks red",
      sha: gateResult.sha,
    });
    expect(fake.harness.inspection.experimental_hostRpcCalls).toMatchObject([
      {
        method: "run_gate",
        hostId: "host_9",
        // One call waits as long as one slice of a workflow's gate loop, so a worker's tool call is not held for the host's full budget.
        input: {
          cwd: "/work/tree",
          gate: "review",
          pr: 12,
          issue: "ABC-3",
          timeoutMs: GATE_CALL_TIMEOUT_MS,
        },
      },
    ]);
    expect(await gates()).toMatchObject([
      { outcome: "ran", exitCode: 1, gate: "review", threadId: "thr_1", sha: gateResult.sha },
    ]);
  });

  it("returns an open gate (exit 0) as a normal result", async () => {
    const { fake, gates } = await pluginWith(() => ({
      ...gateResult,
      exitCode: 0,
      lastLine: "GATE pre-review open",
    }));
    const result = toolResult(
      await fake.harness.behavior.callAgentTool(
        "optio_gate",
        { gate: "pre-review", pr: 3, issue: "ABC-1" },
        { threadId: "thr_2" },
      ),
    );
    expect(result.isError).toBe(false);
    expect(await gates()).toMatchObject([{ outcome: "ran", exitCode: 0, gate: "pre-review" }]);
  });

  it("records a thread with no environment as an error and does not run", async () => {
    const { fake, gates } = await pluginWith(() => gateResult);
    const result = toolResult(
      await fake.harness.behavior.callAgentTool(
        "optio_gate",
        { gate: "land", pr: 3, issue: "ABC-1" },
        { threadId: "thr_bare" },
      ),
    );
    expect(result.isError).toBe(true);
    expect(fake.harness.inspection.experimental_hostRpcCalls).toEqual([]);
    expect(await gates()).toMatchObject([{ outcome: "error", threadId: "thr_bare" }]);
  });

  it("records a host failure as an error", async () => {
    const { fake, gates } = await pluginWith(() => {
      throw new Error("scripts/gate.mjs does not exist");
    });
    const result = toolResult(
      await fake.harness.behavior.callAgentTool(
        "optio_gate",
        { gate: "land", pr: 3, issue: "ABC-1" },
        { threadId: "thr_1" },
      ),
    );
    expect(result.isError).toBe(true);
    expect(await gates()).toMatchObject([
      { outcome: "error", reason: expect.stringContaining("does not exist") },
    ]);
  });
});

describe("the host entry's run_gate", () => {
  const signal = () => ({ signal: new AbortController().signal });

  it("gives a tool call the wait budget of one workflow slice", () => {
    expect(gateWaitSeconds(GATE_CALL_TIMEOUT_MS)).toBe(480);
  });

  it("runs the fixed gate script with the validated arguments and reports the repo's own HEAD", async () => {
    const { dir, sha } = stubRepo('console.log("argv " + process.argv.slice(2).join(" "));\n');
    const result = await runGate({ cwd: dir, gate: "review", pr: 12, issue: "ABC-3" }, signal());
    expect(result).toMatchObject({
      exitCode: 0,
      lastLine: "argv review 12 --issue ABC-3 --timeout 1140",
      sha,
      cwd: dir,
    });
  });

  it("hands the gate a wait budget below the host's timeout, so CI that is still pending is the gate's own verdict", async () => {
    const { dir } = stubRepo('console.log("argv " + process.argv.slice(2).join(" "));\n');
    const input = { cwd: dir, pr: 4, issue: "ABC-3" } as const;
    expect(
      await runGate({ ...input, gate: "pre-review", timeoutMs: 600_000 }, signal()),
    ).toMatchObject({ lastLine: "argv pre-review 4 --issue ABC-3 --timeout 540" });
    expect(await runGate({ ...input, gate: "land" }, signal())).toMatchObject({
      lastLine: "argv land 4 --issue ABC-3",
    });
    expect(gateWaitSeconds(200)).toBe(1);
  });

  it("reports a closed gate's exit code", async () => {
    const { dir } = stubRepo('console.log("GATE closed");\nprocess.exit(1);\n');
    expect(
      await runGate({ cwd: dir, gate: "land", pr: 1, issue: "ABC-1" }, signal()),
    ).toMatchObject({ exitCode: 1, lastLine: "GATE closed" });
  });

  it("returns 143 for a gate that outlives the host's timeout instead of throwing", async () => {
    const { dir } = stubRepo("setTimeout(() => {}, 60_000);\n");
    const result = await runGate(
      { cwd: dir, gate: "review", pr: 1, issue: "ABC-1", timeoutMs: 200 },
      signal(),
    );
    expect(result.exitCode).toBe(143);
  });

  it("accepts no script, extra field or unknown gate from the caller", async () => {
    const input = hostContract.run_gate.input["~standard"];
    const ok = { cwd: "/x", gate: "review", pr: 1, issue: "ABC-1" };
    expect(await input.validate(ok)).not.toHaveProperty("issues");
    expect(await input.validate({ ...ok, script: "other.mjs" })).toHaveProperty("issues");
    expect(await input.validate({ ...ok, gate: "result" })).toHaveProperty("issues");
    expect(await input.validate({ ...ok, issue: "--x" })).toHaveProperty("issues");
  });
});

describe("the host entry's pr_head", () => {
  const signal = () => ({ signal: new AbortController().signal });

  /** A `gh` on PATH that prints its arguments to a file and answers with a fixed head. */
  function stubGh(answer: string, exitCode = 0) {
    const dir = mkdtempSync(join(tmpdir(), "optio-gh-"));
    temps.push(dir);
    const argsFile = join(dir, "args");
    const gh = join(dir, "gh");
    writeFileSync(
      gh,
      `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\necho '${answer}'\nexit ${exitCode}\n`,
    );
    chmodSync(gh, 0o755);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    return argsFile;
  }
  afterEach(() => vi.unstubAllEnvs());

  it("reads the head with a fixed gh pr view for the given repo and pull request", async () => {
    const argsFile = stubGh("0123456789abcdef0123456789abcdef01234567");
    const result = await prHead({ repo: "acme/shop", pr: 12 }, signal());
    expect(result).toEqual({ sha: "0123456789abcdef0123456789abcdef01234567" });
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(argsFile, "utf8").trim().split("\n")).toEqual([
      "pr",
      "view",
      "12",
      "--repo",
      "acme/shop",
      "--json",
      "headRefOid",
      "--jq",
      ".headRefOid",
    ]);
  });

  it("rejects when gh fails", async () => {
    stubGh("boom", 1);
    await expect(prHead({ repo: "acme/shop", pr: 12 }, signal())).rejects.toThrow();
  });

  it("accepts only an owner/name repo, a pull request and no other field", async () => {
    const input = hostContract.pr_head.input["~standard"];
    const ok = { repo: "acme/shop", pr: 1 };
    expect(await input.validate(ok)).not.toHaveProperty("issues");
    expect(await input.validate({ ...ok, repo: "--help" })).toHaveProperty("issues");
    expect(await input.validate({ ...ok, repo: "a/b --x" })).toHaveProperty("issues");
    expect(await input.validate({ ...ok, pr: "1" })).toHaveProperty("issues");
    expect(await input.validate({ ...ok, cwd: "/x" })).toHaveProperty("issues");
  });
});
