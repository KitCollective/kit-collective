// The header a Staff chat shows: the Staff member's title, status, last Heartbeat and budget used,
// and an Update button that opens their settings page. It mounts on every thread, so it asks the
// server first and draws nothing for a thread that is not a Staff chat.
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PANEL, when } from "../shared/common";
import { useLoaded } from "../shared/use-loaded";

/** The mark an overridden value carries, as on the Loops page: visible text, with who set it and when. */
function Overridden({ by, at }: { by: string; at: string }) {
  return (
    <span title={`Overrides the Charter: set by ${by} at ${at}`} className="ml-1 text-amber-600">
      (override)
    </span>
  );
}

export function StaffChatHeader({
  threadId,
  isCompactViewport,
}: {
  threadId: string;
  isCompactViewport: boolean;
}) {
  const navigate = useBbNavigate();
  const { value: header } = useLoaded(
    (rpc) => rpc.call("staff_chat_header", { threadId }),
    threadId,
  );
  if (header === null) return null;
  const heartbeat =
    header.lastHeartbeat === null ? "no Heartbeat yet" : `Heartbeat ${when(header.lastHeartbeat)}`;
  const budget =
    header.budget.limit === null
      ? "budget not set"
      : header.budget.used === null
        ? `budget ${header.budget.limit}, use not measured`
        : `budget ${header.budget.used} of ${header.budget.limit}`;
  const details = (
    <>
      <span className="truncate">{heartbeat}</span>
      <span className="truncate">
        {budget}
        {header.overrides.budget === null ? null : <Overridden {...header.overrides.budget} />}
      </span>
    </>
  );
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            header.status === "on" ? "bg-emerald-500" : "bg-muted-foreground",
          )}
        />
        <span className="truncate text-foreground">{header.title}</span>
        <span>
          {header.status}
          {header.overrides.status === null ? null : <Overridden {...header.overrides.status} />}
        </span>
        {isCompactViewport ? null : details}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate.toPluginPanel(PANEL, { subPath: header.agentId })}
        >
          Update
        </Button>
      </div>
      {isCompactViewport ? <div className="flex min-w-0 items-center gap-2">{details}</div> : null}
    </div>
  );
}
