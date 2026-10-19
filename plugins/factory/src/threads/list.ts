// Optio's thread list: the threads of bb, filed for the sidebar. The Staff are on top, an Issue
// thread (a root thread titled with its issue's key) goes under the state its issue is in, in Linear,
// the threads spawned under a thread are folded under it, and what is neither an issue nor a Staff
// member's is listed last under Other. The page draws it; this decides where each thread goes.

import type { z } from "zod";
import type { Core } from "../core.js";
import { inboxConfig } from "../inbox/contract.js";
import type { SchedulerConfig } from "../scheduler-config.js";
import type { threadsContract } from "./contract.js";
import { fetchStates, type IssueState } from "./linear.js";

type Listed = z.output<typeof threadsContract.threads_list.output>;
type Thread = Listed["other"][number]["thread"];
type Group = Listed["groups"][number];
type GroupId = Group["id"];

/** A bb thread, as much of it as the list reads. */
interface Row {
  id: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  status: string;
  updatedAt: number;
  createdAt: number;
}

/** What `staff_list` answers: the Staff members, each with its Staff chat once it has one. */
export interface StaffEntry {
  agentId: string;
  name: string;
  title: string;
  chatThreadId: string | null;
}

/** The groups in the order they are shown. */
const GROUPS: { id: GroupId; title: string }[] = [
  { id: "waiting", title: "Waiting on you" },
  { id: "running", title: "Running" },
  { id: "landing", title: "Landing" },
  { id: "done", title: "Done today" },
  { id: "idle", title: "Not running" },
];

/** Where the Inbox keeps its configuration (src/inbox/index.ts); its state is where issues wait for a person. */
const INBOX_CONFIG_KEY = "inbox";

const PAGE = 200;
const MAX_PAGES = 20;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The group of an issue's state. The state names are the product's, so they are read from the
 * configuration the Inbox and the board already hold: the Inbox state waits on a person, the board's
 * active states are running, and any other started state, bar the board's blocked one, is landing.
 */
function groupOf(
  state: IssueState | undefined,
  waiting: string | null,
  board: SchedulerConfig,
): GroupId {
  if (state === undefined) return "idle";
  if (state.type === "completed") return "done";
  if (state.state === waiting) return "waiting";
  if (board.activeStates.includes(state.state)) return "running";
  return state.type === "started" && state.state !== board.blockedState ? "landing" : "idle";
}

export function createThreadList(core: Core, staffList: () => Promise<{ staff: StaffEntry[] }>) {
  const { bb, storedScheduler, linearApiKey } = core;

  /** Every unarchived, visible thread of every project. */
  async function allThreads(): Promise<Row[]> {
    const found: Row[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const threads = await bb.sdk.threads.list({
        archived: false,
        limit: PAGE,
        offset: page * PAGE,
      });
      found.push(...threads);
      if (threads.length < PAGE) break;
    }
    return found;
  }

  const shown = (row: Row): Thread => ({
    id: row.id,
    title: row.title ?? row.titleFallback ?? row.id,
    status: row.status,
    updatedAt: row.updatedAt,
  });

  async function list(): Promise<Listed> {
    const rows = await allThreads();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const childrenOf = new Map<string, Row[]>();
    for (const row of rows) {
      if (row.parentThreadId === null || !byId.has(row.parentThreadId)) continue;
      childrenOf.set(row.parentThreadId, [...(childrenOf.get(row.parentThreadId) ?? []), row]);
    }
    // A thread whose parent is archived or hidden is a root here, so it is never lost.
    const roots = rows.filter(
      (row) => row.parentThreadId === null || !byId.has(row.parentThreadId),
    );

    /** The threads below `id`, depth first, the oldest of each level first. */
    const below = (id: string, depth = 1): (Thread & { depth: number })[] =>
      [...(childrenOf.get(id) ?? [])]
        .sort((a, b) => a.createdAt - b.createdAt)
        .flatMap((row) => [{ ...shown(row), depth }, ...below(row.id, depth + 1)]);
    /** The latest change in a thread or any thread below it. */
    const touched = (row: Row): number =>
      Math.max(row.updatedAt, ...below(row.id).map((thread) => thread.updatedAt));

    const errors: string[] = [];
    const taken = new Set<string>();

    // The Staff: the standing chat, and the daily activity threads named after the member.
    const staff: Listed["staff"] = [];
    try {
      for (const member of (await staffList()).staff) {
        const chat = member.chatThreadId === null ? undefined : byId.get(member.chatThreadId);
        const daily = new RegExp(`^${escapeRegExp(member.name)} · \\d{4}-\\d{2}-\\d{2}`);
        const activity = roots
          .filter((row) => daily.test(row.title ?? "") && row.id !== chat?.id)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        for (const row of [...(chat === undefined ? [] : [chat]), ...activity]) {
          taken.add(row.id);
        }
        staff.push({
          agentId: member.agentId,
          name: member.name,
          title: member.title,
          chat: chat === undefined ? null : shown(chat),
          activity: activity.map(shown),
        });
      }
    } catch (error) {
      errors.push(
        `the Staff could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // The Issue threads, by the state of their issue.
    const board = await storedScheduler();
    const inbox = inboxConfig.safeParse(await bb.storage.kv.get<unknown>(INBOX_CONFIG_KEY));
    if (!inbox.success) {
      errors.push("the Inbox is not set up, so no thread is filed under Waiting on you");
    }
    const issues = new Map<GroupId, Listed["groups"][number]["issues"]>();
    if (board === null) {
      errors.push("the board is not set up, so no thread is filed under an issue");
    } else {
      const own = new RegExp(`^(${escapeRegExp(board.teamKey)}-(\\d+))$`);
      const candidates = roots.flatMap((row) => {
        const match = taken.has(row.id) ? null : own.exec(row.title ?? "");
        return match === null
          ? []
          : [{ row, identifier: match[1] ?? "", number: Number(match[2]) }];
      });
      let states = new Map<string, IssueState>();
      if (candidates.length > 0) {
        try {
          states = new Map(
            (
              await fetchStates(
                await linearApiKey(),
                board.teamKey,
                candidates.map(({ number }) => number),
              )
            ).map((issue) => [issue.identifier, issue]),
          );
        } catch (error) {
          errors.push(
            `Linear could not be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      for (const { row, identifier } of [...candidates].sort(
        (a, b) => touched(b.row) - touched(a.row),
      )) {
        const state = states.get(identifier);
        const group = groupOf(state, inbox.success ? inbox.data.state : null, board);
        taken.add(row.id);
        issues.set(group, [
          ...(issues.get(group) ?? []),
          {
            identifier,
            issueTitle: state?.title ?? null,
            state: state?.state ?? null,
            thread: shown(row),
            children: below(row.id),
          },
        ]);
      }
    }
    const groups: Group[] = GROUPS.flatMap(({ id, title }) => {
      const held = issues.get(id);
      return held === undefined ? [] : [{ id, title, issues: held }];
    });

    // Under the Staff and the Issue threads the children are folded; the rest is Other.
    const other = roots
      .filter((row) => !taken.has(row.id))
      .sort((a, b) => touched(b) - touched(a))
      .map((row) => ({ thread: shown(row), children: below(row.id) }));

    return { error: errors.length === 0 ? null : errors.join("; "), staff, groups, other };
  }

  return { list };
}
