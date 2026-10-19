// The Issue-thread archiver: an Issue thread (the bb thread titled with its issue's key) whose
// issue has been Done for a day is archived, with its child threads. Archiving is reversible and
// deletes nothing; a thread that someone unarchived is not archived again for that Done. `createThreads`
// gives the area's RPC handler and registers its schedule and event; server.ts builds it and registers
// the handler with one line, and src/contract.ts spreads the area's `threadsContract`.
import type { PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { Core } from "../core.js";
import type { threadsContract } from "./contract.js";
import { fetchDone } from "./linear.js";
import { createThreadList, type StaffEntry } from "./list.js";

/** How long an issue stays Done before its thread is archived. */
const DONE_FOR_MS = 24 * 3_600_000;
const PAGE = 200;
const MAX_PAGES = 20;
const LEDGER = "thread-archive:";
/** A bb thread title that is exactly an issue key. */
const ISSUE_KEY = /^[A-Z][A-Z0-9]*-\d+$/;
/** A thread in one of these statuses has work going on in it. */
const WORKING = new Set(["active", "starting", "stopping"]);

/** When Optio last archived a thread, and when anyone last brought it back (epoch ms). */
const ledgerEntry = z.object({
  archivedAt: z.number().optional(),
  unarchivedAt: z.number().optional(),
});

export function createThreads(core: Core, staffList: () => Promise<{ staff: StaffEntry[] }>) {
  const { bb, settings, storedScheduler, linearApiKey } = core;
  const kv = bb.storage.kv;

  async function touched(threadId: string): Promise<number> {
    const entry = ledgerEntry.safeParse(await kv.get<unknown>(LEDGER + threadId));
    return entry.success ? Math.max(entry.data.archivedAt ?? 0, entry.data.unarchivedAt ?? 0) : 0;
  }
  async function remember(threadId: string, change: z.infer<typeof ledgerEntry>): Promise<void> {
    const entry = ledgerEntry.safeParse(await kv.get<unknown>(LEDGER + threadId));
    await kv.set(LEDGER + threadId, { ...(entry.success ? entry.data : {}), ...change });
  }

  /** Every unarchived thread of the bb project with no parent. */
  async function roots(projectId: string) {
    const found = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const threads = await bb.sdk.threads.list({
        projectId,
        archived: false,
        hasParent: false,
        limit: PAGE,
        offset: page * PAGE,
      });
      found.push(...threads);
      if (threads.length < PAGE) break;
    }
    return found;
  }

  /** True when a thread under `threadId`, children and their children included, is working. */
  async function workingBelow(threadId: string): Promise<boolean> {
    const children = await bb.sdk.threads.list({ parentThreadId: threadId, archived: false });
    for (const child of children) {
      if (WORKING.has(child.status) || (await workingBelow(child.id))) return true;
    }
    return false;
  }

  async function sweep(): Promise<z.output<typeof threadsContract.threads_archive_done.output>> {
    try {
      const board = await storedScheduler();
      if (board === null) {
        throw new Error("the board is not set up: open the Agents page, Board");
      }
      const own = new RegExp(`^(${board.teamKey}-(\\d+))$`);
      const candidates = (await roots(board.projectId)).flatMap((thread) => {
        const match = own.exec(thread.title ?? "");
        return match === null ? [] : [{ thread, issue: match[1], number: Number(match[2]) }];
      });
      if (candidates.length === 0) return { error: null, archived: [] };

      const numbers = candidates.map(({ number }) => number);
      const done = new Map(
        (await fetchDone(await linearApiKey(), board.teamKey, numbers)).map((issue) => [
          issue.identifier,
          issue.completedAt,
        ]),
      );

      const archived = [];
      for (const { thread, issue } of candidates) {
        const completedAt = done.get(issue);
        if (completedAt === undefined || Date.now() - completedAt < DONE_FOR_MS) continue;
        // Someone brought it back, or Optio archived it once already: a Done that came before
        // that is settled. Only a later Done (the issue was reopened and finished again) counts.
        if ((await touched(thread.id)) >= completedAt) continue;
        if (WORKING.has(thread.status) || (await workingBelow(thread.id))) continue;
        const result = await bb.sdk.threads.archiveAll({ threadId: thread.id });
        await remember(thread.id, { archivedAt: Date.now() });
        archived.push({ issue, threadIds: result.archivedThreadIds });
      }
      return { error: null, archived };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), archived: [] };
    }
  }

  let sweeping = false;
  bb.background.schedule("archive-done-threads", "7 * * * *", async () => {
    if (sweeping || (await settings.get()).paused) return;
    sweeping = true;
    try {
      const result = await sweep();
      if (result.error !== null) bb.log.error(`archiving Done threads failed: ${result.error}`);
      else if (result.archived.length > 0) {
        bb.log.info(
          `archived the threads of ${result.archived.map(({ issue }) => issue).join(", ")}`,
        );
      }
    } finally {
      sweeping = false;
    }
  });

  bb.events.on("thread.unarchived", async ({ thread }) => {
    if (thread.parentThreadId !== null || !ISSUE_KEY.test(thread.title ?? "")) return;
    await remember(thread.id, { unarchivedAt: Date.now() });
  });

  const rpc: PluginRpcHandlers<typeof threadsContract> = {
    threads_archive_done: sweep,
    threads_list: createThreadList(core, staffList).list,
  };

  return { rpc };
}
