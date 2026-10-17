import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { issueLoops, parseRegistry } from "./loop-registry.js";

const issueLoop = {
  name: "Issue run",
  enabled: true,
  workflow: "issue-run",
  trigger: {
    kind: "issue",
    state: "Ready",
    label: "agent-ready",
    unblocked: true,
    skipLabels: ["on-hold"],
    priorityOrder: [1, 2, 3, 4, 0],
  },
  machines: ["mac", "harness"],
  maxLive: 3,
};
const milestoneLoop = {
  name: "Milestone check",
  enabled: false,
  workflow: "milestone-check",
  trigger: { kind: "milestone-done", states: ["Done", "Canceled"] },
  machines: ["harness"],
  maxLive: 1,
};
const registry = (loops: unknown[] = [issueLoop, milestoneLoop], flow: unknown = undefined) =>
  JSON.stringify({ product: { name: "Anything" }, loops, flow });

const refused = (text: string) => {
  const parsed = parseRegistry(text);
  if (parsed.ok) throw new Error("parsed");
  return parsed.error;
};

describe("parseRegistry", () => {
  it("reads the repository a run's PR links into, and refuses a malformed one", () => {
    const withRepo = (ownerRepo: unknown) =>
      JSON.stringify({ loops: [issueLoop], github: { ownerRepo, other: 1 } });
    expect(parseRegistry(withRepo("acme/app"))).toMatchObject({
      ok: true,
      registry: { repo: "acme/app" },
    });
    expect(parseRegistry(registry())).toMatchObject({ ok: true, registry: { repo: null } });
    expect(refused(withRepo("not a repo"))).toContain("factory.config.json.github.ownerRepo");
  });

  it("reads the loops and the per-day cap, ignoring the rest of the config", () => {
    const parsed = parseRegistry(registry(undefined, { maxRunsPerDay: 3, runLog: "x" }));
    expect(parsed).toMatchObject({ ok: true, registry: { maxRunsPerDay: 3 } });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.registry.loops.map((loop) => loop.name)).toEqual([
      "Issue run",
      "Milestone check",
    ]);
    expect(issueLoops(parsed.registry).map((loop) => loop.name)).toEqual(["Issue run"]);
    expect(parseRegistry(registry())).toMatchObject({
      ok: true,
      registry: { maxRunsPerDay: null },
    });
  });

  it("refuses a registry that does not parse, naming the path", () => {
    expect(refused("{ not json")).toContain("factory.config.json is not valid JSON");
    expect(refused("{}")).toContain("factory.config.json.loops:");
    expect(refused(registry([]))).toContain("factory.config.json.loops:");
    expect(refused(registry([{ ...issueLoop, trigger: { kind: "cron" } }]))).toContain(
      "factory.config.json.loops.0.trigger.kind",
    );
    expect(refused(registry([{ ...issueLoop, maxLive: -1 }]))).toContain("loops.0.maxLive");
    expect(refused(registry([{ ...issueLoop, machines: [] }]))).toContain("loops.0.machines");
    expect(refused(registry([{ ...issueLoop, machines: ["mac", "mac"] }]))).toContain(
      "loops.0.machines: a machine is named twice",
    );
    expect(refused(registry([issueLoop, { ...issueLoop, name: "issue RUN" }]))).toContain(
      'loops.1.name: Loop name "issue RUN" is used twice',
    );
    expect(refused(registry([{ ...issueLoop, extra: 1 }]))).toContain("loops.0");
    expect(refused(registry(undefined, { maxRunsPerDay: 0 }))).toContain("flow.maxRunsPerDay");
  });

  it("refuses to switch the milestone-done trigger on", () => {
    expect(refused(registry([{ ...milestoneLoop, enabled: true }]))).toContain(
      "loops.0.enabled: the milestone-done trigger is not supported",
    );
  });
});

describe("the repo's own registry", () => {
  const root = new URL("../../../", import.meta.url);
  for (const file of ["factory.config.json", "factory.config.example.json"]) {
    it(`${file} parses, and its issue trigger is the dispatch block`, () => {
      const text = readFileSync(new URL(file, root), "utf8");
      const parsed = parseRegistry(text);
      if (!parsed.ok) throw new Error(parsed.error);
      const config = JSON.parse(text);
      const loops = parsed.registry.loops;
      for (const loop of loops) {
        const workflow = fileURLToPath(new URL(`.bb/workflows/${loop.workflow}.js`, root));
        expect(existsSync(workflow)).toBe(true);
        expect(loop.maxLive).toBeGreaterThan(0);
        if (loop.trigger.kind === "milestone-done") expect(loop.enabled).toBe(false);
      }
      expect(loops.some((loop) => loop.trigger.kind === "milestone-done")).toBe(true);
      const issueTriggers = loops.flatMap((loop) =>
        loop.trigger.kind === "issue" ? [loop.trigger] : [],
      );
      expect(issueTriggers.length).toBeGreaterThan(0);
      for (const trigger of issueTriggers) {
        expect(trigger.state).toBe(config.dispatch.state);
        expect(trigger.unblocked).toBe(config.dispatch.requireUnblocked);
        expect(trigger.priorityOrder).toEqual(config.dispatch.priorityOrder);
      }
    });
  }
});
