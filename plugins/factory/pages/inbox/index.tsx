// The Inbox page: what waits for a person, read from Linear on each open and on Refresh. A list
// of messages on the left and the open message on the right, like a mail client; the open
// message is the panel's `subPath` (the issue identifier), so a message has its own link and
// back/forward walks between them. On a narrow viewport the list and the message take turns.
import {
  type PluginNavPanelProps,
  useBbNavigate,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../src/contract";
import type { InboxCardDto, InboxDto } from "../../src/inbox/contract";

const PATH = "inbox";

function kindLabel(card: InboxCardDto): string {
  return card.kind === "question" ? (card.label ?? "question") : "green review";
}

function preview(card: InboxCardDto): string {
  if (card.kind === "question") return card.waiting?.ask ?? "The workpad holds no question.";
  return card.review?.verdict ?? "No review verdict recorded.";
}

function waited(since: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

function Row({ card, open, onOpen }: { card: InboxCardDto; open: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={open ? "true" : undefined}
        className={cn(
          "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
          open ? "bg-muted" : "hover:bg-muted/50",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              card.kind === "question" ? "bg-amber-500" : "bg-emerald-500",
            )}
            aria-hidden
          />
          <span className="font-medium">{card.identifier}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {waited(card.since)}
          </span>
        </div>
        <p className="mt-0.5 truncate">{card.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {kindLabel(card)} · {preview(card)}
        </p>
      </button>
    </li>
  );
}

function Detail({ card, onBack }: { card: InboxCardDto; onBack: () => void }) {
  const question = card.kind === "question";
  return (
    <article className="flex flex-col gap-4">
      <div className="flex items-center gap-2 md:hidden">
        <Button variant="ghost" onClick={onBack}>
          <Icon name="ChevronLeft" className="size-4" />
          Inbox
        </Button>
      </div>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5">{kindLabel(card)}</span>
          <span>waiting {waited(card.since)}</span>
        </div>
        <h2 className="text-base font-medium">
          {card.identifier} · {card.title}
        </h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href={card.url} target="_blank" rel="noreferrer" className="hover:underline">
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
      {question ? (
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
      ) : (
        <section className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
          <h3 className="text-xs text-muted-foreground">Review</h3>
          <p>{card.review?.verdict ?? "No review verdict recorded."}</p>
          <p className="text-xs text-muted-foreground">
            {card.review?.change ?? "The pull request has no title."}
          </p>
        </section>
      )}
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
  const [inbox, setInbox] = useState<InboxDto | null>(null);
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
  useEffect(refetch, [refetch]);
  useRealtime("changed", refetch);
  const problem = failure ?? inbox?.error ?? null;
  const cards = inbox?.cards ?? [];
  const open = cards.find((card) => card.identifier === subPath) ?? null;
  const show = (identifier: string) => navigate.toPluginPanel(PATH, { subPath: identifier });
  const back = () => navigate.toPluginPanel(PATH, { subPath: "" });

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside
        className={cn(
          "flex min-h-0 w-full flex-col border-border md:w-80 md:shrink-0 md:border-r",
          open !== null && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
          <h1 className="text-base font-medium">
            Inbox{cards.length === 0 ? "" : ` · ${cards.length}`}
          </h1>
          <Button variant="ghost" onClick={refetch} aria-label="Refresh">
            <Icon name="RefreshCw" className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {problem !== null ? (
            <Message role="alert">{problem}</Message>
          ) : inbox === null ? (
            <Message role="status">Reading Linear…</Message>
          ) : cards.length === 0 ? (
            <Message role="status">Nothing waits for you.</Message>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {cards.map((card) => (
                <Row
                  key={card.identifier}
                  card={card}
                  open={card.identifier === open?.identifier}
                  onOpen={() => show(card.identifier)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
      <main
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 md:px-6",
          open === null && "hidden md:block",
        )}
      >
        {open !== null ? (
          <Detail card={open} onBack={back} />
        ) : (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            {cards.length === 0 ? "" : "Choose a message."}
          </p>
        )}
      </main>
    </div>
  );
}
