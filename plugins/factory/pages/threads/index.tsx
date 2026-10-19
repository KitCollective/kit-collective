// Optio's thread list, the sidebar's scrolling thread area (bb's thread-list replacement, chosen
// under Settings → Appearance → Sidebar). The Staff are on top, then the Issue threads grouped by
// what their issue waits on, with the Lead, Engineer and Reviewer threads folded under them, and
// last the threads that are no issue and no Staff member's. While the Inbox page is open the list
// holds the Inbox messages instead, the same ones in the same order, and opening one shows it there.
// The server (src/threads/list.ts) decides where each thread goes; bb's live view of the threads
// adds what changes by the second: the status glyph, and which thread is unread.
import {
  type PluginSidebarThread,
  type PluginThreadListProps,
  experimental_ThreadStatusGlyph as ThreadStatusGlyph,
  useBbNavigate,
  useRealtime,
  useRpc,
  experimental_useSidebarThreads as useSidebarThreads,
} from "@get-bb/plugin-sdk/app";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../src/contract";
import type { InboxListDto } from "../../src/inbox/contract";
import type { ThreadListDto } from "../../src/threads/contract";
import { MessageRow } from "../inbox/message-row";
import { useInboxPanel } from "../inbox/panel-state";
import { INBOX } from "../shared/common";

type ThreadsDto = ThreadListDto;
type ListedThread = ThreadsDto["other"][number]["thread"];
type Child = ThreadsDto["groups"][number]["issues"][number]["children"][number];

/** Linear changes without telling Optio, so the filing is read again at this pace. */
const REFRESH_MS = 60_000;

/** The filing of the threads, read again when Optio says something changed and when bb's threads do. */
function useFiling(live: readonly PluginSidebarThread[]) {
  const rpc = useRpc<typeof rpcContract>();
  const [filing, setFiling] = useState<ThreadsDto | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("threads_list").then(
      (next) => {
        setFiling(next);
        setFailure(null);
      },
      (cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc]);
  // A thread made, renamed, moved or archived changes the shape of the list; its status alone does not.
  const shape = useMemo(
    () =>
      live
        .map(
          (thread) =>
            `${thread.id}:${thread.displayTitle}:${thread.parentThreadId}:${thread.lifecycleOwnerThreadId}`,
        )
        .join("|"),
    [live],
  );
  useEffect(refetch, [refetch, shape]);
  useRealtime("changed", refetch);
  useEffect(() => {
    const timer = setInterval(refetch, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refetch]);
  return { filing, failure, refetch };
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function Note({ role, children }: { role: "alert" | "status"; children: string }) {
  return (
    <p
      role={role}
      className={cn(
        "px-2 py-1 text-sm",
        role === "alert" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

interface RowProps {
  thread: ListedThread;
  live: ReadonlyMap<string, PluginSidebarThread>;
  activeThreadId: string | null;
  onOpen: (threadId: string) => void;
  /** Smaller and indented: a thread folded under another. */
  depth?: number;
  /** The first line, when the thread's own title is not what the row is about. */
  label?: string;
  detail?: string | null;
}

function ThreadRow({ thread, live, activeThreadId, onOpen, depth = 0, label, detail }: RowProps) {
  const known = live.get(thread.id);
  const active = thread.id === activeThreadId;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(thread.id)}
        aria-current={active ? "true" : undefined}
        style={{ paddingLeft: `${0.5 + depth * 0.875}rem` }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
          active ? "bg-muted" : "hover:bg-muted/50",
          depth > 0 && "text-muted-foreground",
        )}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {known === undefined ? null : (
            <ThreadStatusGlyph indicator={known.indicator} size="compact" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", known?.isUnread && "font-medium")}>
            {label ?? known?.displayTitle ?? thread.title}
          </span>
          {detail === undefined || detail === null ? null : (
            <span className="block truncate text-xs text-muted-foreground">{detail}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function Folded({
  children,
  ...row
}: { children: Child[] } & Omit<RowProps, "depth" | "thread" | "label" | "detail">) {
  return (
    <>
      {children.map((child) => (
        <ThreadRow key={child.id} {...row} thread={child} depth={child.depth} />
      ))}
    </>
  );
}

function Threads({
  activeThreadId,
  onNavigate,
}: Pick<PluginThreadListProps, "activeThreadId" | "onNavigate">) {
  const navigate = useBbNavigate();
  const { threads } = useSidebarThreads();
  const { filing, failure, refetch } = useFiling(threads);
  const live = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  const open = (threadId: string) => {
    navigate.toThread(threadId);
    onNavigate();
  };
  const row = { live, activeThreadId, onOpen: open };

  const problem = failure ?? filing?.error ?? null;
  const empty =
    filing !== null &&
    filing.staff.length === 0 &&
    filing.groups.length === 0 &&
    filing.other.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {problem === null ? null : <Note role="alert">{problem}</Note>}
        {filing === null ? (
          problem === null ? (
            <Note role="status">Reading the threads…</Note>
          ) : null
        ) : empty ? (
          <Note role="status">No threads yet.</Note>
        ) : (
          <>
            {filing.staff.length === 0 ? null : (
              <section>
                <Heading>Staff</Heading>
                <ul className="flex flex-col gap-0.5">
                  {filing.staff.map((member) => (
                    <Fragment key={member.agentId}>
                      {member.chat === null ? (
                        <li className="px-2 py-1.5 text-sm text-muted-foreground">
                          {member.name} · {member.title}
                        </li>
                      ) : (
                        <ThreadRow
                          {...row}
                          thread={member.chat}
                          label={member.name}
                          detail={member.title}
                        />
                      )}
                      {member.activity.map((thread) => (
                        <ThreadRow key={thread.id} {...row} thread={thread} depth={1} />
                      ))}
                    </Fragment>
                  ))}
                </ul>
              </section>
            )}
            {filing.groups.map((group) => (
              <section key={group.id}>
                <Heading>{group.title}</Heading>
                <ul className="flex flex-col gap-0.5">
                  {group.issues.map((issue) => (
                    <Fragment key={issue.thread.id}>
                      <ThreadRow
                        {...row}
                        thread={issue.thread}
                        label={issue.identifier}
                        detail={
                          issue.issueTitle === null
                            ? null
                            : group.id === "idle" && issue.state !== null
                              ? `${issue.issueTitle} · ${issue.state}`
                              : issue.issueTitle
                        }
                      />
                      <Folded {...row}>{issue.children}</Folded>
                    </Fragment>
                  ))}
                </ul>
              </section>
            ))}
            {filing.other.length === 0 ? null : (
              <section>
                <Heading>Other</Heading>
                <ul className="flex flex-col gap-0.5">
                  {filing.other.map((entry) => (
                    <Fragment key={entry.thread.id}>
                      <ThreadRow {...row} thread={entry.thread} />
                      <Folded {...row}>{entry.children}</Folded>
                    </Fragment>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end px-2 pb-2">
        <Button variant="ghost" size="icon" onClick={refetch} aria-label="Refresh the thread list">
          <Icon name="RefreshCw" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** The Inbox messages, as the Inbox page lists them: same read, same order, same words. */
function Messages({ onNavigate }: Pick<PluginThreadListProps, "onNavigate">) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const { messageId, version } = useInboxPanel();
  const [inbox, setInbox] = useState<InboxListDto | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("inbox_list").then(
      (next) => {
        setInbox(next);
        setFailure(null);
      },
      (cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc]);
  useEffect(refetch, [refetch, version]);
  useRealtime("changed", refetch);
  const problem = failure ?? inbox?.error ?? null;
  const cards = inbox?.cards ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h1 className="text-base font-medium">
          Inbox{cards.length === 0 ? "" : ` · ${cards.length}`}
        </h1>
        <Button variant="ghost" size="icon" onClick={refetch} aria-label="Refresh">
          <Icon name="RefreshCw" className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {problem === null ? null : <Note role="alert">{problem}</Note>}
        {inbox === null ? (
          problem === null ? (
            <Note role="status">Reading Linear…</Note>
          ) : null
        ) : cards.length === 0 ? (
          problem === null ? (
            <Note role="status">Nothing waits for you.</Note>
          ) : null
        ) : (
          <ul className="flex flex-col gap-0.5">
            {cards.map((card) => (
              <MessageRow
                key={card.id}
                card={card}
                open={card.id === messageId}
                onOpen={() => {
                  navigate.toPluginPanel(INBOX, { subPath: card.id });
                  onNavigate();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ThreadList({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const { open } = useInboxPanel();
  return open ? (
    <Messages onNavigate={onNavigate} />
  ) : (
    <Threads activeThreadId={activeThreadId} onNavigate={onNavigate} />
  );
}
