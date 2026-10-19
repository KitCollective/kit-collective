import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const CHARTER = [
  "---",
  "name: Max",
  "title: Engineering Manager",
  "heartbeat: every 5 minutes, plus a daily status at 08:00",
  "limits:",
  "  live_runs: 3",
  "---",
  "",
  "# Max",
].join("\n");

interface Thread {
  id: string;
  title: string | null;
  parentThreadId: string | null;
  lifecycleOwnerThreadId: string | null;
  visibility: "hidden" | "visible";
  status: "idle" | "active" | "error";
  archivedAt: number | null;
  projectId: string;
  createdAt: number;
  updatedAt: number;
}
let clock = 0;
const thread = (id: string, title: string | null, extra: Partial<Thread> = {}): Thread => {
  clock += 1;
  return {
    id,
    title,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    visibility: "visible",
    status: "idle",
    archivedAt: null,
    projectId: "proj_1",
    createdAt: clock,
    updatedAt: clock,
    ...extra,
  };
};

interface Issue {
  identifier: string;
  title: string;
  state: string;
  type: string;
}
const issue = (identifier: string, state: string, type = "started"): Issue => ({
  identifier,
  title: `Title of ${identifier}`,
  state,
  type,
});

interface Options {
  threads: Thread[];
  issues?: Issue[];
  linearFails?: boolean;
  board?: boolean;
  /** The Inbox is set up, with Approval as the state where issues wait for a person. */
  inbox?: boolean;
  /** Max has a Charter in the project, so he is Staff, and his Staff chat is `thr_chat`. */
  staff?: boolean;
}

/** A fake bb with the given threads and a fake Linear behind `fetch`. */
async function load({
  threads,
  issues = [],
  linearFails = false,
  board = true,
  inbox = true,
  staff = false,
}: Options) {
  const list = vi.fn(
    async (
      args: { archived?: boolean; includeHidden?: boolean; limit?: number; offset?: number } = {},
    ) =>
      threads
        .filter((t) => (args.archived === false ? t.archivedAt === null : true))
        .filter((t) => args.includeHidden === true || t.visibility === "visible")
        .slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 1000))
        .map((t) => makeThreadResponse({ ...t })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      linearFails
        ? new Response("{}", { status: 500 })
        : new Response(
            JSON.stringify({
              data: {
                issues: {
                  nodes: issues.map((i) => ({
                    identifier: i.identifier,
                    title: i.title,
                    state: { name: i.state, type: i.type },
                  })),
                },
              },
            }),
          ),
    ),
  );
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearApiKey: "lin_key" },
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        list,
        spawn: async () => ({ id: "thr_chat" }),
        get: async ({ threadId }: { threadId: string }) => {
          const found = threads.find((t) => t.id === threadId);
          if (found === undefined) throw new Error("not found");
          return makeThreadResponse({ ...found });
        },
      },
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async ({ path }: { path: string }) => {
          if (path !== "staff/max.md") throw new Error(`no ${path}`);
          return {
            content: CHARTER,
            contentEncoding: "utf8",
            mimeType: "text/markdown",
            sizeBytes: CHARTER.length,
          };
        },
      },
    },
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
  const rpc = host.harness.behavior.callRpc as Rpc;
  if (board) {
    await rpc("board_setup", {
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["In Progress", "In Review"],
      blockedState: "Blocked",
    });
  }
  if (inbox) {
    const set = await host.harness.behavior.runCli([
      "inbox",
      "--state",
      "Approval",
      "--labels",
      "asks",
    ]);
    expect(set.exitCode).toBe(0);
  }
  if (staff) {
    await rpc("agent_create", {
      name: "Max",
      description: "",
      projectId: "proj_1",
      instructions: "Do the work.",
      enabled: true,
      httpTrigger: false,
    });
    await rpc("staff_chat_open", { agentId: "max" });
  }
  return { rpc };
}

const ids = (items: { thread: { id: string } }[]) => items.map((item) => item.thread.id);

afterEach(() => vi.unstubAllGlobals());

describe("Optio's thread list", () => {
  it("files Issue threads under the state their issue is in, in the order of the groups", async () => {
    const { rpc } = await load({
      threads: [
        thread("thr_1", "ENG-1"),
        thread("thr_2", "ENG-2"),
        thread("thr_3", "ENG-3"),
        thread("thr_4", "ENG-4"),
        thread("thr_5", "ENG-5"),
        thread("thr_6", "ENG-6"),
        thread("thr_7", "ENG-7"),
        thread("thr_8", "ENG-8"),
      ],
      issues: [
        issue("ENG-1", "Done", "completed"),
        issue("ENG-2", "Post-Merge"),
        issue("ENG-3", "In Review"),
        issue("ENG-4", "Approval"),
        issue("ENG-5", "Merging"),
        issue("ENG-6", "In Progress"),
        issue("ENG-7", "Blocked"),
        issue("ENG-8", "Canceled", "canceled"),
      ],
    });
    const result = await rpc("threads_list", null);
    expect(result.error).toBeNull();
    expect(
      result.groups.map((group) => [group.title, group.issues.map((i) => i.identifier).sort()]),
    ).toEqual([
      ["Waiting on you", ["ENG-4"]],
      ["Running", ["ENG-3", "ENG-6"]],
      ["Landing", ["ENG-2", "ENG-5"]],
      ["Done today", ["ENG-1"]],
      ["Not running", ["ENG-7", "ENG-8"]],
    ]);
    expect(result.other).toEqual([]);
  });

  it("leaves out a group with no Issue thread, and shows the issue's title and state", async () => {
    const { rpc } = await load({
      threads: [thread("thr_4", "ENG-4")],
      issues: [issue("ENG-4", "Approval")],
    });
    const { groups } = await rpc("threads_list", null);
    expect(groups.map((group) => group.id)).toEqual(["waiting"]);
    expect(groups[0]?.issues[0]).toMatchObject({
      identifier: "ENG-4",
      issueTitle: "Title of ENG-4",
      state: "Approval",
      thread: { id: "thr_4", title: "ENG-4" },
    });
  });

  it("folds the Lead, Engineer and Reviewer threads under their Issue thread, outside Other", async () => {
    const { rpc } = await load({
      threads: [
        thread("thr_a", "ENG-1"),
        thread("thr_lead", "lead:ENG-1", { parentThreadId: "thr_a" }),
        thread("thr_eng", "engineer:ENG-1:r1", { parentThreadId: "thr_a" }),
        thread("thr_rev", "reviewer:ENG-1", { parentThreadId: "thr_eng" }),
      ],
      issues: [issue("ENG-1", "In Progress")],
    });
    const result = await rpc("threads_list", null);
    const [entry] = result.groups[0]?.issues ?? [];
    expect(entry?.children.map((c) => [c.id, c.depth])).toEqual([
      ["thr_lead", 1],
      ["thr_eng", 1],
      ["thr_rev", 2],
    ]);
    expect(result.other).toEqual([]);
  });

  it("folds the workflow's hidden threads, which follow their Issue thread's lifecycle, under it", async () => {
    // The shape bb gives them: no parent, an owner, hidden.
    const workflow = (id: string, title: string, owner: string) =>
      thread(id, title, {
        lifecycleOwnerThreadId: owner,
        visibility: "hidden",
        status: "active",
      });
    const { rpc } = await load({
      threads: [
        thread("thr_a", "ENG-1"),
        workflow("thr_lead", "lead:ENG-1", "thr_a"),
        workflow("thr_eng", "engineer:ENG-1:r0", "thr_a"),
        workflow("thr_rev", "reviewer:ENG-1:r0", "thr_a"),
        // Visible, as the shadow reviewers are: folded all the same, not filed under Other.
        thread("thr_shadow", "reviewer:ENG-1:shadow:openrouter", {
          lifecycleOwnerThreadId: "thr_a",
        }),
        // Hidden, and its Issue thread is gone: bb hides it, so the list does too.
        workflow("thr_lost", "lead:ENG-9", "thr_gone"),
      ],
      issues: [issue("ENG-1", "In Progress")],
    });
    const result = await rpc("threads_list", null);
    const [entry] = result.groups[0]?.issues ?? [];
    expect(entry?.children.map((c) => [c.id, c.depth])).toEqual([
      ["thr_lead", 1],
      ["thr_eng", 1],
      ["thr_rev", 1],
      ["thr_shadow", 1],
    ]);
    expect(result.other).toEqual([]);
  });

  it("puts the Staff on top: the chat and the daily activity threads, outside Other", async () => {
    const { rpc } = await load({
      staff: true,
      threads: [
        thread("thr_chat", "Max"),
        thread("thr_old", "Max · 2026-10-17"),
        thread("thr_new", "Max · 2026-10-18"),
        thread("thr_plain", "Refactor the thing"),
      ],
    });
    const result = await rpc("threads_list", null);
    expect(result.staff).toHaveLength(1);
    expect(result.staff[0]).toMatchObject({
      agentId: "max",
      name: "Max",
      title: "Engineering Manager",
      chat: { id: "thr_chat" },
    });
    expect(result.staff[0]?.activity.map((t) => t.id)).toEqual(["thr_new", "thr_old"]);
    expect(ids(result.other)).toEqual(["thr_plain"]);
  });

  it("lists a thread that is no issue and no Staff member's under Other, with its children", async () => {
    const { rpc } = await load({
      threads: [
        thread("thr_plain", "Refactor the thing"),
        thread("thr_sub", "check it", { parentThreadId: "thr_plain" }),
        thread("thr_none", null),
        thread("thr_ops", "OPS-9"),
        // A thread named after the issue, but spawned under another thread, is folded, not filed.
        thread("thr_nested", "ENG-1", { parentThreadId: "thr_plain" }),
        thread("thr_elsewhere", "Notes", { projectId: "proj_2" }),
      ],
    });
    const result = await rpc("threads_list", null);
    expect(result.groups).toEqual([]);
    expect(ids(result.other).sort()).toEqual(
      ["thr_elsewhere", "thr_none", "thr_ops", "thr_plain"].sort(),
    );
    const plain = result.other.find((entry) => entry.thread.id === "thr_plain");
    expect(plain?.children.map((c) => c.id)).toEqual(["thr_sub", "thr_nested"]);
    expect(result.other.find((entry) => entry.thread.id === "thr_none")?.thread.title).toBe(
      "thr_none",
    );
  });

  it("never lists an archived thread", async () => {
    const { rpc } = await load({
      threads: [
        thread("thr_a", "ENG-1", { archivedAt: 5 }),
        thread("thr_b", "ENG-2"),
        thread("thr_c", "Old chat", { archivedAt: 5 }),
      ],
      issues: [issue("ENG-1", "Done", "completed"), issue("ENG-2", "Approval")],
    });
    const result = await rpc("threads_list", null);
    expect(result.groups.flatMap((g) => g.issues.map((i) => i.identifier))).toEqual(["ENG-2"]);
    expect(result.other).toEqual([]);
  });

  it("files the Issue threads as not running, with the reason, when Linear cannot be read", async () => {
    const { rpc } = await load({
      threads: [thread("thr_a", "ENG-1"), thread("thr_p", "Refactor the thing")],
      linearFails: true,
    });
    const result = await rpc("threads_list", null);
    expect(result.error).toMatch(/Linear could not be read/);
    expect(result.groups.map((g) => [g.id, g.issues.map((i) => i.state)])).toEqual([
      ["idle", [null]],
    ]);
    expect(ids(result.other)).toEqual(["thr_p"]);
  });

  it("says the Inbox is not set up, and files no thread under Waiting on you, without it", async () => {
    const { rpc } = await load({
      inbox: false,
      threads: [thread("thr_a", "ENG-1"), thread("thr_b", "ENG-2")],
      issues: [issue("ENG-1", "Approval"), issue("ENG-2", "In Progress")],
    });
    const result = await rpc("threads_list", null);
    expect(result.error).toMatch(/Inbox is not set up/);
    expect(result.groups.map((group) => group.id)).not.toContain("waiting");
    expect(result.groups.flatMap((g) => g.issues.map((i) => i.identifier)).sort()).toEqual([
      "ENG-1",
      "ENG-2",
    ]);
  });

  it("lists every thread under Other, and says why, when the board is not set up", async () => {
    const { rpc } = await load({
      board: false,
      threads: [thread("thr_a", "ENG-1"), thread("thr_p", "Refactor the thing")],
    });
    const result = await rpc("threads_list", null);
    expect(result.error).toMatch(/board is not set up/);
    expect(result.groups).toEqual([]);
    expect(ids(result.other).sort()).toEqual(["thr_a", "thr_p"]);
  });
});
