// The Inbox page: one card for every issue that waits for a person, read from Linear on each open
// and on Refresh.
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../src/contract";
import type { InboxCardDto, InboxDto } from "../../src/inbox/contract";

function Card({ card }: { card: InboxCardDto }) {
  const question = card.kind === "question";
  return (
    <li
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        question ? "border-dashed border-border" : "border-border bg-muted/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {question ? (card.label ?? "question") : "green review"}
        </span>
        <a href={card.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
          {card.identifier}
        </a>
        <span className="min-w-0 flex-1 truncate">{card.title}</span>
        {card.pullRequest === null ? null : (
          <a
            href={card.pullRequest.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:underline"
          >
            PR #{card.pullRequest.number}
          </a>
        )}
      </div>
      {question ? (
        card.waiting === null ? (
          <p className="mt-2 text-muted-foreground">The workpad holds no question.</p>
        ) : (
          <>
            <p className="mt-2">{card.waiting.ask}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {card.waiting.stage === "" ? "Stage unknown" : `Stage: ${card.waiting.stage}`}
              {card.waiting.asked === null ? "" : ` · asked ${card.waiting.asked}`}
            </p>
          </>
        )
      ) : (
        <>
          <p className="mt-2">{card.review?.verdict ?? "No review verdict recorded."}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {card.review?.change ?? "The pull request has no title."}
          </p>
        </>
      )}
    </li>
  );
}

function Message({ role, children }: { role: "alert" | "status"; children: string }) {
  return (
    <p
      role={role}
      className={cn("text-sm", role === "alert" ? "text-destructive" : "text-muted-foreground")}
    >
      {children}
    </p>
  );
}

export function Inbox() {
  const rpc = useRpc<typeof rpcContract>();
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
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-3xl px-4 pb-8 pt-3 md:px-5 md:pt-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-medium">Inbox</h1>
          <Button variant="outline" onClick={refetch}>
            <Icon name="RefreshCw" className="size-4" />
            Refresh
          </Button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {problem !== null ? (
            <Message role="alert">{problem}</Message>
          ) : inbox === null ? (
            <Message role="status">Reading Linear…</Message>
          ) : inbox.cards.length === 0 ? (
            <Message role="status">Nothing waits for you.</Message>
          ) : (
            <ul className="flex flex-col gap-2">
              {inbox.cards.map((card) => (
                <Card key={card.identifier} card={card} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
