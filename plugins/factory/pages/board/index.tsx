// The board area: the orchestrator's Board page, its setup, machines and requirements.
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { BoardDto, MachineDto, RequirementDto } from "../../src/board/contract";
import { field, PANEL } from "../shared/common";
import { Back, CheckboxRow, Empty, Labeled, Page, Problem, Rows, Section } from "../shared/layout";
import type { Rpc } from "../shared/use-loaded";
import { useLoaded } from "../shared/use-loaded";

const list = (text: string) =>
  text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

// ---- The board -------------------------------------------------------------------------------

function BoardSetup({ act }: { act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void> }) {
  const { value } = useLoaded((rpc) => rpc.call("agents_list"), "setup");
  const [form, setForm] = useState({
    projectId: "",
    teamKey: "",
    backlogState: "",
    activeStates: "",
    blockedState: "",
  });
  const activeStates = form.activeStates
    .split(",")
    .map((state) => state.trim())
    .filter((state) => state !== "");
  const complete =
    form.projectId !== "" &&
    form.teamKey !== "" &&
    form.backlogState.trim() !== "" &&
    activeStates.length > 0;
  return (
    <Section title="Set up the board">
      <p className="text-sm text-muted-foreground">
        The board reads one Linear team. Which issues start which workflow comes from the Loops in
        the project's factory.config.json. It starts in dry-run: it shows the plan and starts
        nothing.
      </p>
      <Labeled label="Project">
        <select
          className={field}
          value={form.projectId}
          onChange={(event) => setForm({ ...form, projectId: event.target.value })}
        >
          <option value="">Choose a project…</option>
          {(value?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="Linear team key" hint="The prefix of the team's issues, e.g. ENG.">
        <Input
          value={form.teamKey}
          onChange={(event) => setForm({ ...form, teamKey: event.target.value.toUpperCase() })}
        />
      </Labeled>
      <Labeled
        label="Backlog state"
        hint="Where unstarted work waits before the orchestrator promotes it."
      >
        <Input
          value={form.backlogState}
          onChange={(event) => setForm({ ...form, backlogState: event.target.value })}
        />
      </Labeled>
      <Labeled
        label="Active states"
        hint="The states in which an issue is being worked on, separated by commas."
      >
        <Input
          value={form.activeStates}
          onChange={(event) => setForm({ ...form, activeStates: event.target.value })}
        />
      </Labeled>
      <Labeled
        label="Blocked state"
        hint="Issues here go back to the first issue Loop's state once their blockers are done. Empty when the team has none."
      >
        <Input
          value={form.blockedState}
          onChange={(event) => setForm({ ...form, blockedState: event.target.value })}
        />
      </Labeled>
      <Button
        className="mt-4"
        disabled={!complete}
        onClick={() =>
          void act((rpc) =>
            rpc.call("board_setup", {
              projectId: form.projectId,
              teamKey: form.teamKey,
              backlogState: form.backlogState.trim(),
              activeStates,
              blockedState: form.blockedState.trim() === "" ? null : form.blockedState.trim(),
            }),
          )
        }
      >
        Set up
      </Button>
    </Section>
  );
}

function Machines({
  board,
  act,
}: {
  board: BoardDto;
  act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void>;
}) {
  const { value } = useLoaded((rpc) => rpc.call("hosts_list"), "hosts");
  const blank = { id: "", hostId: "", branch: "origin/main", cap: 1, capabilities: "" };
  const [draft, setDraft] = useState(blank);
  const save = (machines: MachineDto[]) => act((rpc) => rpc.call("board_update", { machines }));
  const hostName = (hostId: string) =>
    value?.hosts.find((host) => host.id === hostId)?.name ?? hostId;
  return (
    <Section title="Machines and capacity">
      <Rows
        empty="No machines: nothing can start. Add one below."
        rows={board.machines.map((machine) => (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{machine.id}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {hostName(machine.hostId)} · from {machine.branch}
                {machine.capabilities.length === 0
                  ? null
                  : ` · has ${machine.capabilities.join(", ")}`}
              </span>
            </span>
            <label
              htmlFor={`machine-cap-${machine.id}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              Runs at once
              <Input
                id={`machine-cap-${machine.id}`}
                type="number"
                min={0}
                max={16}
                className="w-16"
                value={machine.cap}
                onChange={(event) => {
                  const cap = Number(event.target.value);
                  if (Number.isInteger(cap) && cap >= 0 && cap <= 16) {
                    void save(
                      board.machines.map((other) =>
                        other.id === machine.id ? { ...other, cap } : other,
                      ),
                    );
                  }
                }}
              />
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${machine.id}`}
              onClick={() => void save(board.machines.filter((other) => other.id !== machine.id))}
            >
              <Icon name="Trash2" className="size-4" />
            </Button>
          </>
        ))}
      />
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Input
          placeholder="name"
          value={draft.id}
          onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase() })}
        />
        <select
          className={field}
          value={draft.hostId}
          onChange={(event) => setDraft({ ...draft, hostId: event.target.value })}
        >
          <option value="">Machine…</option>
          {(value?.hosts ?? []).map((host) => (
            <option key={host.id} value={host.id}>
              {host.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="branch"
          value={draft.branch}
          onChange={(event) => setDraft({ ...draft, branch: event.target.value })}
        />
        <Input
          placeholder="has: postgres, …"
          value={draft.capabilities}
          onChange={(event) => setDraft({ ...draft, capabilities: event.target.value })}
        />
        <Button
          variant="outline"
          disabled={
            draft.id === "" ||
            draft.hostId === "" ||
            draft.branch === "" ||
            board.machines.some((machine) => machine.id === draft.id)
          }
          onClick={() =>
            void save([
              ...board.machines,
              { ...draft, capabilities: list(draft.capabilities) },
            ]).then(() => setDraft(blank))
          }
        >
          Add machine
        </Button>
      </div>
    </Section>
  );
}

function Requirements({
  board,
  act,
}: {
  board: BoardDto;
  act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void>;
}) {
  const blank = { capability: "", labels: "", scope: "" };
  const [draft, setDraft] = useState(blank);
  const save = (requirements: RequirementDto[]) =>
    act((rpc) => rpc.call("board_update", { requirements }));
  return (
    <Section title="Routing rules">
      <p className="mb-2 text-xs text-muted-foreground">
        An issue with one of the labels, or a write scope under one of the paths, runs only on a
        machine that has the capability.
      </p>
      <Rows
        empty="No rules: every issue may run on every machine."
        rows={board.requirements.map((rule, index) => (
          <>
            <span className="min-w-0 flex-1 truncate">
              Needs <span className="font-medium">{rule.capability}</span>
              <span className="text-muted-foreground">
                {rule.labels.length === 0 ? "" : ` · labels ${rule.labels.join(", ")}`}
                {rule.scope.length === 0 ? "" : ` · paths ${rule.scope.join(", ")}`}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Remove rule"
              onClick={() => void save(board.requirements.filter((_, other) => other !== index))}
            >
              <Icon name="Trash2" className="size-4" />
            </Button>
          </>
        ))}
      />
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Input
          placeholder="capability"
          value={draft.capability}
          onChange={(event) => setDraft({ ...draft, capability: event.target.value })}
        />
        <Input
          placeholder="labels: api, …"
          value={draft.labels}
          onChange={(event) => setDraft({ ...draft, labels: event.target.value })}
        />
        <Input
          placeholder="paths: apps/api/, …"
          value={draft.scope}
          onChange={(event) => setDraft({ ...draft, scope: event.target.value })}
        />
        <Button
          variant="outline"
          disabled={
            draft.capability.trim() === "" ||
            (list(draft.labels).length === 0 && list(draft.scope).length === 0)
          }
          onClick={() =>
            void save([
              ...board.requirements,
              {
                capability: draft.capability.trim(),
                labels: list(draft.labels),
                scope: list(draft.scope),
              },
            ]).then(() => setDraft(blank))
          }
        >
          Add rule
        </Button>
      </div>
    </Section>
  );
}

export function Board() {
  const navigate = useBbNavigate();
  const { value: board, error, act } = useLoaded((rpc) => rpc.call("board_get"), "board");
  return (
    <Page>
      <Back to="" label="Agents" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <h1 className="text-base font-medium">Board</h1>
        <Button
          variant="outline"
          onClick={() => navigate.toPluginPanel(PANEL, { subPath: "runs" })}
        >
          <Icon name="List" className="size-4" />
          Runs
        </Button>
      </div>
      <Problem message={error} />
      {board === null ? (
        error === null ? (
          <div className="mt-4">
            <Empty>Reading Linear…</Empty>
          </div>
        ) : null
      ) : !board.configured ? (
        <>
          <Problem message={board.error} />
          <BoardSetup act={act} />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Team {board.teamKey} · {board.loops.length} Loops from factory.config.json
            {board.paused ? " · paused in Settings" : ""}
          </p>
          <Problem message={board.error} />
          <Problem
            message={
              board.registryError === null
                ? null
                : `The registry was refused, so nothing is planned or started: ${board.registryError}`
            }
          />
          <div className="mt-2 grid grid-cols-1 gap-x-4 md:grid-cols-3">
            <Labeled
              label="Mode"
              hint={
                board.mode === "live"
                  ? "Starts runs every minute."
                  : "Shows the plan, starts nothing."
              }
            >
              <select
                className={field}
                value={board.mode}
                onChange={(event) =>
                  void act((rpc) =>
                    // SAFETY: the select only offers the three board modes.
                    rpc.call("board_update", { mode: event.target.value as BoardDto["mode"] }),
                  )
                }
              >
                <option value="off">Off</option>
                <option value="dry-run">Dry run</option>
                <option value="live">Live</option>
              </select>
            </Labeled>
            <Labeled label="Focus milestone" hint="Its issues go first; others fill what is left.">
              <select
                className={field}
                value={board.focus ?? ""}
                onChange={(event) =>
                  void act((rpc) =>
                    rpc.call("board_update", {
                      focus: event.target.value === "" ? null : event.target.value,
                    }),
                  )
                }
              >
                <option value="">None</option>
                {board.focus !== null &&
                !board.milestones.some((milestone) => milestone.name === board.focus) ? (
                  <option value={board.focus}>{board.focus}</option>
                ) : null}
                {board.milestones
                  .filter((milestone) => milestone.name !== "(no milestone)")
                  .map((milestone) => (
                    <option key={milestone.name} value={milestone.name}>
                      {milestone.name} ({milestone.ready} ready of {milestone.open})
                    </option>
                  ))}
              </select>
            </Labeled>
            <Labeled label="Attempts before a person" hint="Runs in a row that may stop at a gate.">
              <select
                className={field}
                value={board.maxAttempts}
                onChange={(event) =>
                  void act((rpc) =>
                    rpc.call("board_update", { maxAttempts: Number(event.target.value) }),
                  )
                }
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
          <CheckboxRow
            className="mt-3"
            checked={board.autoPromote}
            onCheckedChange={(checked) =>
              void act((rpc) => rpc.call("board_update", { autoPromote: checked }))
            }
          >
            Let the orchestrator refill the queue from the backlog
            <span className="block text-xs text-muted-foreground">
              When the queue has room, it is asked to choose well-formed backlog issues and promote
              them. Room now: {board.room} · backlog issues it could choose from: {board.promotable}
              .
            </span>
          </CheckboxRow>
          <Section title={`Loops (${board.loops.length})`}>
            <Rows
              empty="No Loop: the registry was not read."
              rows={board.loops.map((loop) => (
                <>
                  <span className="w-44 shrink-0 font-medium">{loop.name}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {loop.kind === "issue" ? "issue trigger" : "milestone-done trigger"} ·{" "}
                    {loop.workflow} · {loop.machines.join(", ")}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {loop.enabled ? `${loop.running} of ${loop.maxLive} live` : "disabled"}
                  </span>
                </>
              ))}
            />
          </Section>
          <Section title={`Running (${board.running.length})`}>
            <Rows
              empty="Nothing is running."
              rows={board.running.map((run) => (
                <>
                  <span className="flex-1 font-medium">{run.identifier}</span>
                  <span className="text-muted-foreground">
                    {run.loop === null ? "" : `${run.loop} · `}on {run.machineId}
                  </span>
                </>
              ))}
            />
          </Section>
          <Section
            title={`${board.mode === "live" ? "Starting next" : "Would start"} (${board.start.length})`}
          >
            <Rows
              empty="No ready issue fits right now."
              rows={board.start.map((start) => (
                <>
                  <span className="w-20 shrink-0 font-medium">{start.identifier}</span>
                  <span className="min-w-0 flex-1 truncate">{start.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {start.loop} · {start.milestone ?? "no milestone"} · on {start.machineId}
                    {start.resume ? " · resume" : ""}
                  </span>
                </>
              ))}
            />
          </Section>
          <Section title={`Needs the orchestrator (${board.stalled.length})`}>
            <Rows
              empty="No run stopped at a gate."
              rows={board.stalled.map((stall) => (
                <>
                  <span className="w-20 shrink-0 font-medium">{stall.issue}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {stall.outcome ?? "stopped"}
                  </span>
                </>
              ))}
            />
          </Section>
          <Section title={`Waiting (${board.waiting.length})`}>
            <Rows
              empty="No ready issue is waiting."
              rows={board.waiting.map((wait) => (
                <>
                  <span className="w-20 shrink-0 font-medium">{wait.identifier}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {wait.loop} · {wait.reason}
                  </span>
                </>
              ))}
            />
          </Section>
          <Section title="Record of runs">
            <Rows
              empty="Nothing recorded yet."
              rows={board.decisions.map((decision) => (
                <>
                  <span className="w-20 shrink-0 font-medium">{decision.issue ?? "registry"}</span>
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">
                    {decision.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {decision.loop === null ? "" : `${decision.loop} · `}
                    {decision.reason}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {decision.mode} · {new Date(decision.at).toLocaleString()}
                  </span>
                </>
              ))}
            />
          </Section>
          <Section title="Open issues">
            <p className="text-sm text-muted-foreground">
              {board.states.length === 0
                ? "None."
                : board.states.map((state) => `${state.name} ${state.count}`).join(" · ")}
            </p>
          </Section>
          <Machines board={board} act={act} />
          <Requirements board={board} act={act} />
        </>
      )}
    </Page>
  );
}
