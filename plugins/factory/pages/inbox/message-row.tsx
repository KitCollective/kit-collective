// One Inbox message as a row, with the words that describe it. The Inbox page's detail and Optio's
// thread list (which lists the messages while the Inbox page is open) draw from here, so a message
// reads the same in both.
import { cn } from "@/lib/utils";
import type { InboxListCardDto as InboxCardDto, LandingDto } from "../../src/inbox/contract";
import { DOT } from "../shared/common";

export function kindLabel(card: InboxCardDto): string {
  switch (card.kind) {
    case "question":
      return card.label ?? "question";
    case "mention":
      return "mention";
    case "alarm":
      return "watchdog alarm";
    case "review":
      return "green review";
    case "landing":
      return "approved";
  }
}

/** The colour of a landing card; Home lists no landing, so it is not one of the shared kinds. */
const LANDING_DOT = "bg-sky-500";

export const PHASE_TEXT: Record<LandingDto["phase"], string> = {
  approved: "Approved, not in the merge queue yet",
  queued: "In the merge queue",
  merged: "Merged, waiting for the land gate",
  done: "Done",
  stopped: "Landing stopped",
};

function preview(card: InboxCardDto): string {
  if (card.landing !== null) return PHASE_TEXT[card.landing.phase];
  switch (card.kind) {
    case "question":
      return card.waiting?.ask ?? "The workpad holds no question.";
    case "mention":
      return card.mention?.comment || "Mentioned in the description.";
    case "alarm":
      return card.alarm?.problems.join("; ") || "The alarm lists no problem.";
    case "review":
    case "landing":
      return card.review?.verdict ?? "No review verdict recorded.";
  }
}

export function waited(since: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

export function MessageRow({
  card,
  open,
  onOpen,
}: {
  card: InboxCardDto;
  open: boolean;
  onOpen: () => void;
}) {
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
              card.landing?.phase === "stopped"
                ? DOT.question
                : card.kind === "landing"
                  ? LANDING_DOT
                  : DOT[card.kind],
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
