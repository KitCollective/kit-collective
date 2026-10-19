// The Issue-thread archiver's and the thread list's part of the RPC contract.
import { z } from "zod";

/** A bb thread as the list shows it; the page adds what bb knows live (unread, waiting for input). */
const listedThread = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  updatedAt: z.number(),
});

/** A thread folded under its parent: the Lead, Engineer and Reviewer threads of an Issue thread. */
const child = listedThread.extend({
  /** 1 for a child of the listed thread, 2 for its child, and so on. */
  depth: z.number().int().positive(),
});

/**
 * Where an Issue thread sits, by the state of its issue: `waiting` (the Inbox state), `running` (the
 * board's active states), `landing` (any other started state: the issue is on its way to done),
 * `done` (completed), or `idle` for every other state and for every issue when Linear could not be
 * read.
 */
export const THREAD_GROUPS = ["waiting", "running", "landing", "done", "idle"] as const;

export const threadsContract = {
  threads_archive_done: {
    input: z.null(),
    output: z.object({
      /** Why the sweep could not run, when it could not. */
      error: z.string().nullable(),
      /** The Issue threads archived by this sweep, each with the child threads archived beside it. */
      archived: z.array(z.object({ issue: z.string(), threadIds: z.array(z.string()) })),
    }),
  },
  /** Optio's thread list: the Staff on top, the Issue threads by their issue's state, then the rest. */
  threads_list: {
    input: z.null(),
    output: z.object({
      /** Why the list is not complete (the board or Linear could not be read), when it is not. */
      error: z.string().nullable(),
      staff: z.array(
        z.object({
          agentId: z.string(),
          name: z.string(),
          title: z.string(),
          /** The Staff chat; null until it is first opened. */
          chat: listedThread.nullable(),
          /** The Staff member's daily activity threads, newest first. */
          activity: z.array(listedThread),
        }),
      ),
      /** Only the groups that hold an Issue thread, in the order they are shown. */
      groups: z.array(
        z.object({
          id: z.enum(THREAD_GROUPS),
          title: z.string(),
          issues: z.array(
            z.object({
              identifier: z.string(),
              /** The issue's title in Linear; null when it could not be read. */
              issueTitle: z.string().nullable(),
              /** The issue's state in Linear; null when it could not be read. */
              state: z.string().nullable(),
              thread: listedThread,
              children: z.array(child),
            }),
          ),
        }),
      ),
      /** Threads that belong to no issue and no Staff member, each with the threads folded under it. */
      other: z.array(z.object({ thread: listedThread, children: z.array(child) })),
    }),
  },
};
