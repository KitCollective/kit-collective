// The runs area: the Runs page, every run of every Loop.
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LoopRunDto, RunStateDto } from "../../src/runs/contract";
import { field, when } from "../shared/common";
import { Back, Empty, Page, Problem } from "../shared/layout";
import { useLoaded } from "../shared/use-loaded";

const RUN_STATES: { value: RunStateDto; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
  { value: "handed-over", label: "Handed over" },
];
const STATE_LABEL: Record<RunStateDto, string> = {
  running: "Running",
  stopped: "Stopped",
  "handed-over": "Handed over",
};

const duration = (from: number, to: number | null) => {
  const minutes = Math.max(0, Math.round(((to ?? Date.now()) - from) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

function RunLinks({ run }: { run: LoopRunDto }) {
  const navigate = useBbNavigate();
  const link = "text-xs text-foreground underline underline-offset-2 hover:text-muted-foreground";
  const { threadId, workflowRunId, prNumber, prUrl } = run;
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
      {threadId === null ? null : (
        <button type="button" className={link} onClick={() => navigate.toThread(threadId)}>
          Thread
        </button>
      )}
      {workflowRunId === null ? null : (
        <button
          type="button"
          className={link}
          title={`Copies: bb workflows status ${workflowRunId}`}
          onClick={() =>
            void navigator.clipboard?.writeText(`bb workflows status ${workflowRunId}`)
          }
        >
          Workflow run
        </button>
      )}
      {prNumber === null ? null : prUrl === null ? (
        <span className="text-xs text-muted-foreground">PR #{prNumber}</span>
      ) : (
        <a className={link} href={prUrl} target="_blank" rel="noreferrer">
          PR #{prNumber}
        </a>
      )}
    </span>
  );
}

function RunRow({ run }: { run: LoopRunDto }) {
  const detail =
    run.state === "stopped"
      ? `Stopped${run.step === null ? "" : ` at ${run.step}`}: ${run.stopReason ?? "no reason recorded"}`
      : run.state === "handed-over"
        ? `Handed over${run.handedOverTo === null ? "" : ` to ${run.handedOverTo}`}`
        : `Now at ${run.step ?? "start"}`;
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{run.issue}</span>
        <span
          className={cn(
            "text-xs",
            run.state === "stopped" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {STATE_LABEL[run.state]}
          {run.resume ? " · resume" : ""}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {run.loop ?? "no Loop"} · {run.machineId} · {when(run.startedAt)} ·{" "}
          {duration(run.startedAt, run.endedAt)}
        </span>
        <RunLinks run={run} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {run.gates.length === 0 ? null : (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {run.gates.map((gate) => (
            <li
              key={`${gate.at}-${gate.gate}`}
              className={gate.exitCode === 0 ? "text-muted-foreground" : "text-destructive"}
              title={gate.commit === null ? undefined : `commit ${gate.commit.slice(0, 8)}`}
            >
              {gate.gate}: {gate.verdict}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Runs() {
  const [loop, setLoop] = useState<string | null>(null);
  const [state, setState] = useState<RunStateDto | null>(null);
  const { value, error } = useLoaded(
    (rpc) => rpc.call("runs_list", { loop, state }),
    `runs:${loop ?? ""}:${state ?? ""}`,
  );
  return (
    <Page>
      <Back to="" label="Agents" />
      <h1 className="mt-3 text-base font-medium">Runs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every run the Board started, per Loop: where it is, how it ended and where to look.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          aria-label="Loop"
          className={cn(field, "w-auto")}
          value={loop ?? ""}
          onChange={(event) => setLoop(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">All Loops</option>
          {(value?.loops ?? (loop === null ? [] : [loop])).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="State"
          className={cn(field, "w-auto")}
          value={state ?? ""}
          onChange={(event) =>
            setState(
              RUN_STATES.find((choice) => choice.value === event.target.value)?.value ?? null,
            )
          }
        >
          <option value="">Any state</option>
          {RUN_STATES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>
      <Problem message={error} />
      <div className="mt-4">
        {value === null ? (
          <Empty>Loading runs…</Empty>
        ) : value.runs.length === 0 ? (
          <Empty>No runs match.</Empty>
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {value.runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ul>
            {value.truncated ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the newest {value.runs.length}. Narrow the list with the filters.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Page>
  );
}
