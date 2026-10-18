// "Venter på dig" on bb's Home: how many cards wait in the Inbox and the newest few, each opening the
// Inbox at its card. Read from Linear on mount and whenever Optio publishes a change; with nothing
// waiting, and until the Inbox is set up, the section shows one quiet line.
import { useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../src/contract";
import type { HomeDto } from "../../src/home/contract";

const INBOX = "inbox";

export function Waiting() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [home, setHome] = useState<HomeDto | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("home_waiting").then(
      (next) => {
        setHome(next);
        setFailure(null);
      },
      (cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc]);
  useEffect(refetch, [refetch]);
  useRealtime("changed", refetch);

  const problem = failure ?? home?.error ?? null;
  if (problem !== null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {problem}
      </p>
    );
  }
  if (home === null) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Reading Linear…
      </p>
    );
  }
  if (home.count === 0) {
    return <p className="text-sm text-muted-foreground">Nothing waits for you.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="self-start text-sm font-medium hover:underline"
        onClick={() => navigate.toPluginPanel(INBOX, { subPath: "" })}
      >
        {home.count} in the Inbox
      </button>
      <ul className="flex flex-col gap-0.5">
        {home.newest.map((card) => (
          <li key={card.identifier}>
            <button
              type="button"
              onClick={() => navigate.toPluginPanel(INBOX, { subPath: card.identifier })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  card.kind === "question" ? "bg-amber-500" : "bg-emerald-500",
                )}
                aria-hidden
              />
              <span className="font-medium">{card.identifier}</span>
              <span className="truncate">{card.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
