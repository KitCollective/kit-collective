// "Propose a change", shared by the Loops page and a Staff member's Charter: what a Loop or Staff
// member is stays in the repo (ADR-0065), so the action opens a pull request with the text written
// here and links it. Nothing changes in Optio until that pull request is merged.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProposalDto } from "../../src/loops/contract";
import { when } from "../shared/common";

const NAME_KEY = "optio.loops.by";

/** The RPC has no caller identity, so the page asks who is proposing or changing and remembers it. */
export function useName() {
  const [name, setName] = useState(() => globalThis.localStorage?.getItem(NAME_KEY) ?? "");
  const save = (next: string) => {
    setName(next);
    globalThis.localStorage?.setItem(NAME_KEY, next);
  };
  return [name, save] as const;
}

const STATE: Record<NonNullable<ProposalDto["pr"]>["state"], string> = {
  open: "open, not merged yet",
  merged: "merged",
  closed: "closed without merging",
};

function Proposal({ proposal }: { proposal: ProposalDto }) {
  return (
    <li className="px-4 py-2 text-sm">
      <p className="whitespace-pre-wrap">{proposal.text}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {proposal.by} · {when(Date.parse(proposal.at))} · changes {proposal.file} ·{" "}
        {proposal.pr === null ? (
          "opening the pull request…"
        ) : (
          <>
            <a className="underline" href={proposal.pr.url} target="_blank" rel="noreferrer">
              Pull request #{proposal.pr.number}
            </a>{" "}
            ({STATE[proposal.pr.state]})
          </>
        )}
      </p>
    </li>
  );
}

export function ProposeChange({
  what,
  by,
  proposals,
  onPropose,
  onError,
}: {
  /** What the change is about, for the button: "this Loop", "Max's Charter". */
  what: string;
  by: string;
  proposals: ProposalDto[];
  onPropose: (text: string) => Promise<unknown>;
  /** Shows why a proposal failed; the form stays open with its text. */
  onError: (cause: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const send = () => {
    setSending(true);
    onPropose(text).then(
      () => {
        setText("");
        setOpen(false);
        setSending(false);
      },
      (cause) => {
        onError(cause);
        setSending(false);
      },
    );
  };
  return (
    <div className="mt-3 flex flex-col gap-2">
      {open ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Write the change to {what}. It opens a pull request with your text; nothing changes
            until a person merges it.
          </p>
          <textarea
            aria-label={`Proposed change to ${what}`}
            className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={sending || text.trim() === "" || by.trim() === ""}
              onClick={send}
            >
              Open pull request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Propose a change
          </Button>
        </div>
      )}
      {proposals.length === 0 ? null : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {proposals.map((proposal) => (
            <Proposal key={proposal.id} proposal={proposal} />
          ))}
        </ul>
      )}
    </div>
  );
}
