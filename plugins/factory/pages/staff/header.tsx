// The header a Staff chat shows: the Staff member's title, status, last Heartbeat and budget used,
// and an Update button that opens their settings page. It mounts on every thread, so it asks the
// server first and draws nothing for a thread that is not a Staff chat.
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PANEL, when } from "../shared/common";
import { useLoaded } from "../shared/use-loaded";

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
      : `budget ${header.budget.used ?? "not measured"} of ${header.budget.limit}`;
  return (
    <div
      className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
      title={`${header.name}: ${header.title}, ${header.status}, ${heartbeat}, ${budget}`}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          header.status === "on" ? "bg-emerald-500" : "bg-muted-foreground",
        )}
      />
      <span className="truncate text-foreground">{header.title}</span>
      <span>{header.status}</span>
      {isCompactViewport ? null : (
        <>
          <span className="truncate">{heartbeat}</span>
          <span className="truncate">{budget}</span>
        </>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate.toPluginPanel(PANEL, { subPath: header.agentId })}
      >
        Update
      </Button>
    </div>
  );
}
