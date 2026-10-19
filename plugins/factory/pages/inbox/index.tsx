// The Inbox page: the open message of what waits for a person, read from Linear on each open. It
// has no list of its own: while it is open Optio's thread list in the sidebar lists the messages
// (pages/threads/), and opening one there opens it here. The open message is the panel's `subPath`
// (the issue identifier), so a message has its own link and back/forward walks between them.
import {
  type PluginNavPanelProps,
  useBbNavigate,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../src/contract";
import type {
  InboxListCardDto as InboxCardDto,
  InboxListDto,
  LandingDto,
} from "../../src/inbox/contract";
import { INBOX } from "../shared/common";
import { kindLabel, PHASE_TEXT, waited } from "./message-row";
import { bumpInbox, setInboxPanel, useInboxPanel } from "./panel-state";

const field =
  "min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The reply to a card: an answer for a question (with the run's lettered choices as buttons), a
 * required comment for a green review's Reject. The write goes to Linear as the key's owner; on a failure
 * the card stays and the reason shows under the field, on success the card leaves the Inbox.
 */
function Reply({ card, onSent }: { card: InboxCardDto; onSent: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const question = card.kind === "question";
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const send = (body: string) => {
    setSending(true);
    setFailure(null);
    const sent = question
      ? rpc.call("inbox_answer", { identifier: card.identifier, answer: body })
      : rpc.call("inbox_reject", { identifier: card.identifier, comment: body });
    sent.then(
      (result) => {
        setSending(false);
        if (result.error === null) onSent();
        else setFailure(result.error);
      },
      (cause: unknown) => {
        setSending(false);
        setFailure(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };
  const label = question ? "Answer" : "Reject with a comment";
  return (
    <section className="flex flex-col gap-2">
      {card.choices.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {card.choices.map((choice) => (
            <Button
              key={choice.letter}
              variant="outline"
              disabled={sending}
              onClick={() => send(choice.letter)}
            >
              {choice.letter} · {choice.text}
            </Button>
          ))}
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {label}
        <textarea
          className={cn(field, "text-foreground")}
          value={text}
          disabled={sending}
          onChange={(event) => setText(event.target.value)}
          placeholder={question ? "Write your answer…" : "What has to change…"}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button
          variant={question ? "default" : "destructive"}
          disabled={sending || text.trim() === ""}
          onClick={() => send(text)}
        >
          {question ? "Send answer" : "Reject"}
        </Button>
        {failure === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Approve on a green review: the approver's comment and the move to the merge-permission state, then
 * Optio lands it on the runs machine and the card shows how far it got. A failure shows next to the button.
 */
function Approve({ card }: { card: InboxCardDto }) {
  const rpc = useRpc<typeof rpcContract>();
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const approve = () => {
    setSending(true);
    setFailure(null);
    rpc.call("inbox_approve", { identifier: card.identifier }).then(
      (result) => {
        setSending(false);
        if (result.error !== null) setFailure(result.error);
      },
      (cause: unknown) => {
        setSending(false);
        setFailure(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };
  return (
    <div className="flex items-center gap-3">
      <Button disabled={sending} onClick={approve}>
        {sending ? "Approving…" : "Approve"}
      </Button>
      {failure === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}

/** How far the landing got and what its last slice said. Information only: the card's kind decides its actions. */
function Landing({ landing }: { landing: LandingDto }) {
  return (
    <section
      role="status"
      className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm"
    >
      <h3 className="text-xs text-muted-foreground">Landing</h3>
      <p className={cn(landing.phase === "stopped" && "text-destructive")}>
        {PHASE_TEXT[landing.phase]}
      </p>
      {landing.line === null ? null : (
        <p className="text-xs text-muted-foreground">{landing.line}</p>
      )}
    </section>
  );
}

/** Marks a mention's notification read in Linear; on a failure the reason shows and the card stays. */
function useMarkRead(card: InboxCardDto, onRead: () => void) {
  const rpc = useRpc<typeof rpcContract>();
  const [failure, setFailure] = useState<string | null>(null);
  const markRead = (then: () => void) => {
    const notificationId = card.mention?.notificationId;
    if (notificationId === undefined) return;
    setFailure(null);
    rpc.call("inbox_read", { notificationId }).then(
      (result) => {
        if (result.error === null) then();
        else setFailure(result.error);
      },
      (cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)),
    );
  };
  return { failure, open: () => markRead(onRead), dismiss: () => markRead(onRead) };
}

function Detail({ card, onSent }: { card: InboxCardDto; onSent: () => void }) {
  const mention = useMarkRead(card, onSent);
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5">{kindLabel(card)}</span>
          <span>
            {card.kind === "mention" || card.kind === "alarm" ? "raised" : "waiting"}{" "}
            {waited(card.since)}
          </span>
        </div>
        <h2 className="text-base font-medium">
          {card.identifier} · {card.title}
        </h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href={card.url}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
            onClick={card.kind === "mention" ? mention.open : undefined}
          >
            Open in Linear
          </a>
          {card.pullRequest === null ? null : (
            <a
              href={card.pullRequest.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              PR #{card.pullRequest.number}
            </a>
          )}
        </div>
      </header>
      {card.kind === "question" ? (
        <section className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
          <h3 className="text-xs text-muted-foreground">The run asks</h3>
          {card.waiting === null ? (
            <p className="text-muted-foreground">The workpad holds no question.</p>
          ) : (
            <>
              <p className="whitespace-pre-wrap">{card.waiting.ask}</p>
              <p className="text-xs text-muted-foreground">
                {card.waiting.stage === "" ? "Stage unknown" : `Stage: ${card.waiting.stage}`}
                {card.waiting.asked === null ? "" : ` · asked ${card.waiting.asked}`}
              </p>
            </>
          )}
        </section>
      ) : card.kind === "mention" ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3 text-sm">
          <h3 className="text-xs text-muted-foreground">
            {card.mention?.author ?? "Someone"} mentioned you
          </h3>
          <p className="whitespace-pre-wrap">
            {card.mention?.comment || "The mention is in the issue's description."}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={mention.dismiss}>
              Dismiss
            </Button>
            {mention.failure === null ? null : (
              <p role="alert" className="text-sm text-destructive">
                {mention.failure}
              </p>
            )}
          </div>
        </section>
      ) : card.kind === "alarm" ? (
        <section className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
          <h3 className="text-xs text-muted-foreground">
            The watchdog lists these problems. The card closes when it says they cleared.
          </h3>
          {card.alarm?.problems.length === 0 ? (
            <p className="text-muted-foreground">The alarm lists no problem.</p>
          ) : (
            <ul className="list-disc pl-5">
              {card.alarm?.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
          <h3 className="text-xs text-muted-foreground">Review</h3>
          <p>{card.review?.verdict ?? "No review verdict recorded."}</p>
          <p className="text-xs text-muted-foreground">
            {card.review?.change ?? "The pull request has no title."}
          </p>
        </section>
      )}
      {card.landing === null ? null : <Landing landing={card.landing} />}
      {card.kind === "review" ? <Approve key={card.id} card={card} /> : null}
      {/* A landing card's issue has left the Inbox state: there is nothing to answer or reject. */}
      {card.kind === "question" || card.kind === "review" ? (
        <Reply key={card.id} card={card} onSent={onSent} />
      ) : null}
    </article>
  );
}

function Message({ role, children }: { role: "alert" | "status"; children: string }) {
  return (
    <p
      role={role}
      className={cn(
        "px-3 text-sm",
        role === "alert" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function Inbox({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [inbox, setInbox] = useState<InboxListDto | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { version } = useInboxPanel();
  const refetch = useCallback(() => {
    rpc.call("inbox_list").then(
      (next) => {
        setInbox(next);
        setFailure(null);
      },
      (cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc]);
  // The list of messages is Optio's thread list while this page is open (see panel-state.ts): this
  // page shows only the open message, and tells the list which one it is.
  useEffect(() => {
    setInboxPanel({ open: true, messageId: null });
    return () => setInboxPanel({ open: false, messageId: null });
  }, []);
  useEffect(() => {
    setInboxPanel({ open: true, messageId: subPath === "" ? null : subPath });
  }, [subPath]);
  useEffect(refetch, [refetch, version]);
  useRealtime("changed", refetch);
  const problem = failure ?? inbox?.error ?? null;
  const cards = inbox?.cards ?? [];
  const open = cards.find((card) => card.id === subPath) ?? null;

  let content: ReactNode;
  if (open !== null) {
    content = (
      <Detail
        card={open}
        onSent={() => {
          navigate.toPluginPanel(INBOX, { subPath: "" });
          refetch();
          bumpInbox();
        }}
      />
    );
  } else if (inbox === null && problem === null) {
    content = <Message role="status">Reading Linear…</Message>;
  } else if (subPath !== "") {
    content = <Message role="status">This message has left the Inbox.</Message>;
  } else {
    content = (
      <Message role="status">
        {cards.length === 0 ? "Nothing waits for you." : "Choose a message in the list."}
      </Message>
    );
  }
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 md:px-6">
      {problem === null ? null : <Message role="alert">{problem}</Message>}
      {content}
    </main>
  );
}
