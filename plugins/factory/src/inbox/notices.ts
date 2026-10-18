// What the Inbox reads besides the waiting issues: the key owner's unread mentions and the comments
// of the alarm issue. Both are read fresh on each call.
import { z } from "zod";
import { call } from "./linear.js";

/** Notification types Linear sends when someone mentions the key owner. */
const MENTION_TYPES = new Set(["issueMention", "issueCommentMention"]);
const NOTIFICATION_PAGE = 100;
/** An unread mention can be as old as the inbox, so the read goes to the end; past the cap it shows none and says so. */
const NOTIFICATION_PAGES = 100;
const COMMENT_PAGE = 50;
const COMMENT_PAGES = 20;

/** An unread notification that mentions the key owner. */
export interface Mention {
  notificationId: string;
  identifier: string;
  title: string;
  url: string;
  /** The comment the mention is in; empty when the issue's description mentions them. */
  comment: string;
  author: string | null;
  createdAt: string;
}

const NOTIFICATIONS = `
query Mentions($first: Int!, $after: String) {
  notifications(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id type readAt archivedAt createdAt
      ... on IssueNotification {
        issue { identifier title url }
        comment { body url }
        actor { name }
      }
    }
  }
}`;

const notifications = z.object({
  notifications: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        readAt: z.string().nullable(),
        archivedAt: z.string().nullable(),
        createdAt: z.string(),
        // Absent on a notification that is not about an issue.
        issue: z.object({ identifier: z.string(), title: z.string(), url: z.string() }).nullish(),
        comment: z.object({ body: z.string(), url: z.string().nullish() }).nullish(),
        actor: z.object({ name: z.string() }).nullish(),
      }),
    ),
  }),
});

/** The unread, unarchived mentions of the key owner, as Linear lists them (newest first), from every page of the inbox. */
export async function fetchMentions(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Mention[]> {
  const found: Mention[] = [];
  let after: string | null = null;
  for (let page = 0; page < NOTIFICATION_PAGES; page += 1) {
    const read = notifications.safeParse(
      await call(apiKey, fetchImpl, NOTIFICATIONS, { first: NOTIFICATION_PAGE, after }),
    );
    if (!read.success) throw new Error("Linear's notifications had an unexpected shape");
    const { nodes, pageInfo } = read.data.notifications;
    for (const node of nodes) {
      if (!MENTION_TYPES.has(node.type) || node.readAt !== null || node.archivedAt !== null) {
        continue;
      }
      if (node.issue === null || node.issue === undefined) continue;
      found.push({
        notificationId: node.id,
        identifier: node.issue.identifier,
        title: node.issue.title,
        url: node.comment?.url ?? node.issue.url,
        comment: node.comment?.body ?? "",
        author: node.actor?.name ?? null,
        createdAt: node.createdAt,
      });
    }
    if (!pageInfo.hasNextPage) return found;
    after = pageInfo.endCursor;
  }
  throw new Error(
    `Linear has more than ${NOTIFICATION_PAGE * NOTIFICATION_PAGES} notifications, so no mention card is shown`,
  );
}

/** Marks one notification read in Linear, as the key owner. */
export async function markMentionRead(
  apiKey: string,
  notificationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const done = z.object({ notificationUpdate: z.object({ success: z.boolean() }) }).safeParse(
    await call(
      apiKey,
      fetchImpl,
      `mutation Read($id: String!, $readAt: DateTime!) {
           notificationUpdate(id: $id, input: { readAt: $readAt }) { success }
         }`,
      { id: notificationId, readAt: new Date().toISOString() },
    ),
  );
  if (!done.success || !done.data.notificationUpdate.success) {
    throw new Error("Linear did not mark the notification read");
  }
}

/** A comment on the alarm issue. */
export interface AlarmComment {
  id: string;
  body: string;
  url: string;
  createdAt: string;
}

/** The alarm issue and its comments, oldest first. */
export interface AlarmThread {
  identifier: string;
  title: string;
  url: string;
  comments: AlarmComment[];
}

const ALARM_COMMENTS = `
query Alarm($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    identifier title url
    comments(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id body url createdAt }
    }
  }
}`;

const alarmData = z.object({
  issue: z
    .object({
      identifier: z.string(),
      title: z.string(),
      url: z.string(),
      comments: z.object({
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        nodes: z.array(
          z.object({
            id: z.string(),
            body: z.string(),
            url: z.string().nullish(),
            createdAt: z.string(),
          }),
        ),
      }),
    })
    .nullable(),
});

/** Every comment of the alarm issue, oldest first. */
export async function fetchAlarmThread(
  apiKey: string,
  alarmIssue: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AlarmThread> {
  const comments: AlarmComment[] = [];
  let head: Omit<AlarmThread, "comments"> | null = null;
  let after: string | null = null;
  for (let page = 0; page < COMMENT_PAGES; page += 1) {
    const read = alarmData.safeParse(
      await call(apiKey, fetchImpl, ALARM_COMMENTS, { id: alarmIssue, first: COMMENT_PAGE, after }),
    );
    if (!read.success) throw new Error("Linear's alarm issue had an unexpected shape");
    const { issue } = read.data;
    if (issue === null) throw new Error(`Linear has no alarm issue ${alarmIssue}`);
    head = { identifier: issue.identifier, title: issue.title, url: issue.url };
    for (const comment of issue.comments.nodes) {
      comments.push({
        id: comment.id,
        body: comment.body,
        url: comment.url ?? issue.url,
        createdAt: comment.createdAt,
      });
    }
    if (!issue.comments.pageInfo.hasNextPage) {
      comments.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      return { ...head, comments };
    }
    after = issue.comments.pageInfo.endCursor;
  }
  throw new Error(
    `alarm issue ${alarmIssue} has more than ${COMMENT_PAGE * COMMENT_PAGES} comments, so no alarm card is shown`,
  );
}
