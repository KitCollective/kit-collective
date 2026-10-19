// The staff area: the Staff page, its agents, their chat, memory, automations, follow-ups,
// Linear triggers and instructions, and the composer's agent picker.
import { useBbNavigate, useComposer } from "@get-bb/plugin-sdk/app";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  AgentDto,
  AutomationDto,
  FollowUpDto,
  LinearTriggerDto,
  MemoryDto,
  SessionDto,
} from "../../src/staff/contract";
import { ProposeChange, useName } from "../loops/propose";
import { field, PANEL, when } from "../shared/common";
import { Back, CheckboxRow, Empty, Labeled, Page, Problem, Rows, Section } from "../shared/layout";
import type { Rpc } from "../shared/use-loaded";
import { useLoaded } from "../shared/use-loaded";
import { OperatingSettings } from "./settings";

// ---- Staff list ------------------------------------------------------------------------------

function StaffList() {
  const navigate = useBbNavigate();
  const { value, error, rpc, report } = useLoaded((rpc) => rpc.call("staff_list"), "list");
  const open = (subPath: string) => navigate.toPluginPanel(PANEL, { subPath });
  /** Opens the Staff member's one standing chat; Optio makes it the first time. */
  const chat = (agentId: string) =>
    rpc
      .call("staff_chat_open", { agentId })
      .then(({ threadId }) => navigate.toThread(threadId), report);
  return (
    <Page>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          The Staff, each with their one standing chat. Other agents are listed below them.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => open("runs")}>
            <Icon name="List" className="size-4" />
            Runs
          </Button>
          <Button variant="outline" onClick={() => open("board")}>
            <Icon name="Columns" className="size-4" />
            Board
          </Button>
          <Button onClick={() => open("new")}>
            <Icon name="Plus" className="size-4" />
            New agent
          </Button>
        </div>
      </div>
      <Problem message={error} />
      <div className="mt-4">
        {value === null ? (
          <Empty>Loading the Staff…</Empty>
        ) : value.staff.length === 0 && value.others.length === 0 ? (
          <Empty>No Staff yet. A Staff member is an agent with a Charter in its project.</Empty>
        ) : (
          <>
            {value.staff.length === 0 ? (
              <Empty>No agent has a Charter yet.</Empty>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {value.staff.map((member) => (
                  <li key={member.agentId} className="flex items-center">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-accent"
                      onClick={() => chat(member.agentId)}
                    >
                      <Icon name="MessageSquare" className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {member.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.title}
                        </span>
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      className="mr-2 shrink-0"
                      onClick={() => open(member.agentId)}
                    >
                      Settings
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {value.others.length === 0 ? null : (
              <>
                <h3 className="mb-2 mt-6 text-xs font-medium uppercase text-muted-foreground">
                  Other agents
                </h3>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                  {value.others.map((agent) => (
                    <li key={agent.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent"
                        onClick={() => open(agent.id)}
                      >
                        <Icon
                          name="Bot"
                          className={cn(
                            "size-5 shrink-0",
                            !agent.enabled && "text-muted-foreground",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {agent.name}
                            {agent.enabled ? null : (
                              <span className="ml-2 font-normal text-muted-foreground">off</span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {agent.description || "No description"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

// ---- One agent -------------------------------------------------------------------------------

interface AgentForm {
  name: string;
  description: string;
  projectId: string;
  instructions: string;
  enabled: boolean;
  httpTrigger: boolean;
}

function AgentFields({
  form,
  projects,
  onChange,
}: {
  form: AgentForm;
  projects: { id: string; name: string }[];
  onChange: (next: AgentForm) => void;
}) {
  const set = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) =>
    onChange({ ...form, [key]: value });
  return (
    <>
      <Labeled label="Name">
        <Input
          value={form.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="DevOps"
        />
      </Labeled>
      <Labeled label="Description" hint="One line: the area this agent owns.">
        <Input
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </Labeled>
      <Labeled
        label="Project"
        hint="Chats and automations run in this project's default environment."
      >
        <select
          className={field}
          value={form.projectId}
          onChange={(event) => set("projectId", event.target.value)}
        >
          <option value="">Choose a project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled
        label="Instructions"
        hint="The agent reads these at the start of every session: its area, its rules, what it may and may not touch."
      >
        <textarea
          className={cn(field, "min-h-56 font-mono text-xs")}
          value={form.instructions}
          onChange={(event) => set("instructions", event.target.value)}
        />
      </Labeled>
      <CheckboxRow
        className="mt-3"
        checked={form.enabled}
        onCheckedChange={(checked) => set("enabled", checked)}
      >
        Enabled (automations and triggers run)
      </CheckboxRow>
      <CheckboxRow
        className="mt-2"
        checked={form.httpTrigger}
        onCheckedChange={(checked) => set("httpTrigger", checked)}
      >
        Other systems may start this agent over HTTP
      </CheckboxRow>
    </>
  );
}

function NewAgent() {
  const navigate = useBbNavigate();
  const { rpc, value, error, report } = useLoaded((r) => r.call("agents_list"), "new");
  const [form, setForm] = useState<AgentForm>({
    name: "",
    description: "",
    projectId: "",
    instructions: "",
    enabled: true,
    httpTrigger: false,
  });
  const ready = form.name.trim() !== "" && form.projectId !== "";
  return (
    <Page>
      <Back to="" label="Staff" />
      <h1 className="mt-3 text-base font-medium">New agent</h1>
      <AgentFields form={form} projects={value?.projects ?? []} onChange={setForm} />
      <Problem message={error} />
      <Button
        className="mt-4"
        disabled={!ready}
        onClick={() => {
          rpc
            .call("agent_create", form)
            .then(
              (agent) => navigate.toPluginPanel(PANEL, { subPath: agent.id, replace: true }),
              report,
            );
        }}
      >
        Create agent
      </Button>
    </Page>
  );
}

function ChatTab({
  agent,
  sessions,
  rpc,
  report,
}: {
  agent: AgentDto;
  sessions: SessionDto[];
  rpc: Rpc;
  report: (cause: unknown) => void;
}) {
  const navigate = useBbNavigate();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const start = () => {
    if (message.trim() === "" || pending) return;
    setPending(true);
    rpc
      .call("agent_chat", { id: agent.id, message })
      .then(({ threadId }) => navigate.toThread(threadId), report)
      .finally(() => setPending(false));
  };
  return (
    <>
      <Section title={`Talk to ${agent.name}`}>
        <textarea
          className={cn(field, "min-h-24")}
          value={message}
          placeholder="What do you want to work on or decide?"
          onChange={(event) => setMessage(event.target.value)}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Opens a new thread. The agent loads its instructions and memory first.
          </p>
          <Button disabled={pending || message.trim() === ""} onClick={start}>
            <Icon name="MessageSquare" className="size-4" />
            Start chat
          </Button>
        </div>
      </Section>
      <Section title="Recent sessions">
        {sessions.length === 0 ? (
          <Empty>No sessions yet.</Empty>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{session.source}</span>
                <span className="min-w-0 flex-1 truncate">
                  {when(session.createdAt)}
                  {session.reason === null ? null : (
                    <span className="ml-2 text-muted-foreground">{session.reason}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{session.status}</span>
                {session.threadId === null ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    // SAFETY: the button renders only when session.threadId is not null.
                    onClick={() => navigate.toThread(session.threadId as string)}
                  >
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function MemoryTab({
  agent,
  memories,
  act,
}: {
  agent: AgentDto;
  memories: MemoryDto[];
  act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  return (
    <Section title="Memory">
      <p className="mb-2 text-xs text-muted-foreground">
        What the agent has learned. It saves decisions and durable facts itself while you talk; you
        can add, correct or remove them here.
      </p>
      <div className="flex gap-2">
        <Input
          value={text}
          placeholder="A decision or fact, in one sentence"
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          disabled={text.trim() === ""}
          onClick={() => {
            void act((rpc) => rpc.call("memory_add", { agentId: agent.id, text })).then(() =>
              setText(""),
            );
          }}
        >
          Add
        </Button>
      </div>
      <div className="mt-3">
        {memories.length === 0 ? (
          <Empty>Nothing saved yet.</Empty>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {memories.map((memory) => (
              <li key={memory.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-pre-wrap">{memory.text}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {when(memory.createdAt)} ·{" "}
                    {memory.threadId === null ? "added by hand" : "saved by the agent"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Remove memory"
                  onClick={() => void act((rpc) => rpc.call("memory_delete", { id: memory.id }))}
                >
                  <Icon name="Trash2" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

const SCHEDULES: { label: string; cron: string }[] = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day at 08:00", cron: "0 8 * * *" },
  { label: "Weekdays at 08:00", cron: "0 8 * * 1-5" },
  { label: "Every Monday at 08:00", cron: "0 8 * * 1" },
];
const scheduleLabel = (cron: string) =>
  SCHEDULES.find((entry) => entry.cron === cron)?.label ?? cron;

interface AutomationForm {
  id?: string;
  name: string;
  cron: string;
  kind: "agent" | "workflow";
  prompt: string;
  workflow: string;
  args: string;
  enabled: boolean;
}
const blankAutomation: AutomationForm = {
  name: "",
  cron: "0 8 * * 1-5",
  kind: "agent",
  prompt: "",
  workflow: "",
  args: "",
  enabled: true,
};

/** `issue=ENG-12` lines to an args record; a line without `=` is ignored. */
function parseArgs(text: string): Record<string, string> {
  const args: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) args[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return args;
}

function AutomationEditor({
  form,
  onChange,
}: {
  form: AutomationForm;
  onChange: (next: AutomationForm) => void;
}) {
  const set = <K extends keyof AutomationForm>(key: K, value: AutomationForm[K]) =>
    onChange({ ...form, [key]: value });
  const preset = SCHEDULES.some((entry) => entry.cron === form.cron) ? form.cron : "custom";
  return (
    <div className="rounded-lg border border-border bg-card px-4 pb-4">
      <Labeled label="Name">
        <Input
          value={form.name}
          placeholder="Morning CI check"
          onChange={(event) => set("name", event.target.value)}
        />
      </Labeled>
      <Labeled label="When">
        <select
          className={field}
          value={preset}
          onChange={(event) =>
            set("cron", event.target.value === "custom" ? "*/30 * * * *" : event.target.value)
          }
        >
          {SCHEDULES.map((entry) => (
            <option key={entry.cron} value={entry.cron}>
              {entry.label}
            </option>
          ))}
          <option value="custom">Custom schedule…</option>
        </select>
      </Labeled>
      {preset !== "custom" ? null : (
        <Labeled
          label="Schedule"
          hint="Five fields: minute hour day-of-month month day-of-week, in the server's time zone."
        >
          <Input
            className="font-mono"
            value={form.cron}
            onChange={(event) => set("cron", event.target.value)}
          />
        </Labeled>
      )}
      <Labeled label="What it does">
        <select
          className={field}
          value={form.kind}
          onChange={(event) =>
            set("kind", event.target.value === "workflow" ? "workflow" : "agent")
          }
        >
          <option value="agent">Give the agent a task</option>
          <option value="workflow">Start a bb workflow</option>
        </select>
      </Labeled>
      {form.kind === "agent" ? (
        <Labeled
          label="Task"
          hint="The agent gets this each time, with its instructions and memory."
        >
          <textarea
            className={cn(field, "min-h-28")}
            value={form.prompt}
            onChange={(event) => set("prompt", event.target.value)}
          />
        </Labeled>
      ) : (
        <>
          <Labeled
            label="Workflow"
            hint="The name of a file under .bb/workflows in the agent's project, without .js."
          >
            <Input
              className="font-mono"
              value={form.workflow}
              placeholder="issue-run"
              onChange={(event) => set("workflow", event.target.value)}
            />
          </Labeled>
          <Labeled label="Arguments" hint="One name=value per line.">
            <textarea
              className={cn(field, "min-h-20 font-mono text-xs")}
              value={form.args}
              placeholder={"issue=ENG-12"}
              onChange={(event) => set("args", event.target.value)}
            />
          </Labeled>
        </>
      )}
      <CheckboxRow
        className="mt-3"
        checked={form.enabled}
        onCheckedChange={(checked) => set("enabled", checked)}
      >
        Enabled
      </CheckboxRow>
    </div>
  );
}

function AutomationsTab({
  agent,
  automations,
  act,
  rpc,
  report,
}: {
  agent: AgentDto;
  automations: AutomationDto[];
  act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void>;
  rpc: Rpc;
  report: (cause: unknown) => void;
}) {
  const navigate = useBbNavigate();
  const [form, setForm] = useState<AutomationForm | null>(null);
  const save = (draft: AutomationForm) =>
    act((r) =>
      r.call("automation_save", {
        ...(draft.id === undefined ? {} : { id: draft.id }),
        agentId: agent.id,
        name: draft.name,
        cron: draft.cron,
        prompt: draft.kind === "agent" ? draft.prompt : "",
        workflow: draft.kind === "workflow" ? draft.workflow.trim() : null,
        workflowArgs: draft.kind === "workflow" ? parseArgs(draft.args) : {},
        enabled: draft.enabled,
      }),
    );
  return (
    <Section
      title="Automations"
      action={
        form !== null ? null : (
          <Button variant="outline" size="sm" onClick={() => setForm(blankAutomation)}>
            <Icon name="Plus" className="size-4" />
            New automation
          </Button>
        )
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Recurring work on a schedule: a task for the agent, or a bb workflow to start.
      </p>
      {form === null ? null : (
        <div className="mb-3">
          <AutomationEditor form={form} onChange={setForm} />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button
              disabled={form.name.trim() === ""}
              onClick={() => void save(form).then(() => setForm(null))}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      {automations.length === 0 ? (
        form === null ? (
          <Empty>No automations.</Empty>
        ) : null
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {automations.map((automation) => (
            <li key={automation.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate font-medium",
                    !automation.enabled && "text-muted-foreground",
                  )}
                >
                  {automation.name}
                  {automation.enabled ? null : <span className="ml-2 font-normal">off</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {scheduleLabel(automation.cron)} ·{" "}
                  {automation.workflow === null
                    ? "task for the agent"
                    : `workflow ${automation.workflow}`}{" "}
                  ·{" "}
                  {automation.lastRunAt === null
                    ? "never ran"
                    : `last ran ${when(automation.lastRunAt)}`}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  rpc
                    .call("automation_run", { id: automation.id })
                    .then(({ threadId }) => navigate.toThread(threadId), report);
                }}
              >
                Run now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setForm({
                    id: automation.id,
                    name: automation.name,
                    cron: automation.cron,
                    kind: automation.workflow === null ? "agent" : "workflow",
                    prompt: automation.prompt,
                    workflow: automation.workflow ?? "",
                    args: Object.entries(automation.workflowArgs)
                      .map(([key, value]) => `${key}=${value}`)
                      .join("\n"),
                    enabled: automation.enabled,
                  })
                }
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${automation.name}`}
                onClick={() => void act((r) => r.call("automation_delete", { id: automation.id }))}
              >
                <Icon name="Trash2" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function FollowUps({
  followUps,
  act,
}: {
  followUps: FollowUpDto[];
  act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void>;
}) {
  const navigate = useBbNavigate();
  return (
    <Section title="Scheduled once">
      <p className="mb-2 text-xs text-muted-foreground">
        Follow-ups the agent scheduled for itself: a new thread at that time, which reports back to
        the thread that asked.
      </p>
      <Rows
        empty="No follow-ups are waiting."
        rows={followUps.map((followUp) => (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{followUp.task}</span>
              <span className="block text-xs text-muted-foreground">
                {followUp.status === "started" ? "running since" : "due"} {when(followUp.dueAt)}
              </span>
            </span>
            {followUp.threadId !== null ? (
              <Button
                variant="ghost"
                size="sm"
                // SAFETY: the button renders only when followUp.threadId is not null.
                onClick={() => navigate.toThread(followUp.threadId as string)}
              >
                Open
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void act((rpc) => rpc.call("followup_cancel", { id: followUp.id }))}
              >
                Cancel
              </Button>
            )}
          </>
        ))}
      />
    </Section>
  );
}

const EVENTS: { value: LinearTriggerDto["event"]; label: string }[] = [
  { value: "created", label: "An issue is created" },
  { value: "state", label: "An issue moves to a status" },
  { value: "label", label: "An issue gets a label" },
];

function describeTrigger(trigger: LinearTriggerDto): string {
  const where = `${trigger.teamKey}${trigger.project === null ? "" : ` · ${trigger.project}`}`;
  if (trigger.event === "created") return `${where} · issue created`;
  if (trigger.event === "state") return `${where} · moved to ${trigger.value ?? "any status"}`;
  return `${where} · label ${trigger.value ?? "(any)"} added`;
}

function LinearTriggers({
  agent,
  triggers,
  act,
}: {
  agent: AgentDto;
  triggers: LinearTriggerDto[];
  act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void>;
}) {
  const { value: options } = useLoaded((rpc) => rpc.call("linear_options"), "linear-options");
  const blank: {
    teamKey: string;
    project: string;
    event: LinearTriggerDto["event"];
    value: string;
    task: string;
  } = {
    teamKey: "",
    project: "",
    event: "state",
    value: "",
    task: "",
  };
  const [draft, setDraft] = useState<typeof blank | null>(null);
  const team = options?.teams.find((candidate) => candidate.key === draft?.teamKey);
  return (
    <Section
      title="Linear triggers"
      action={
        draft !== null ? null : (
          <Button variant="outline" size="sm" onClick={() => setDraft(blank)}>
            <Icon name="Plus" className="size-4" />
            New trigger
          </Button>
        )
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Start this agent when something happens in Linear. Checked once a minute.
      </p>
      <Problem message={options?.error ?? null} />
      {draft === null ? null : (
        <div className="mb-3 rounded-lg border border-border bg-card px-4 pb-4">
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Labeled label="Team">
              <select
                className={field}
                value={draft.teamKey}
                onChange={(event) =>
                  setDraft({ ...draft, teamKey: event.target.value, project: "", value: "" })
                }
              >
                <option value="">Choose a team…</option>
                {(options?.teams ?? []).map((candidate) => (
                  <option key={candidate.key} value={candidate.key}>
                    {candidate.name} ({candidate.key})
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Project">
              <select
                className={field}
                value={draft.project}
                onChange={(event) => setDraft({ ...draft, project: event.target.value })}
              >
                <option value="">Any project</option>
                {(team?.projects ?? []).map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="When">
              <select
                className={field}
                value={draft.event}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    // SAFETY: the select only offers EVENTS, whose values are the event enum.
                    event: event.target.value as LinearTriggerDto["event"],
                    value: "",
                  })
                }
              >
                {EVENTS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Labeled>
            {draft.event === "state" ? (
              <Labeled label="Status">
                <select
                  className={field}
                  value={draft.value}
                  onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                >
                  <option value="">Any status</option>
                  {(team?.states ?? []).map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </Labeled>
            ) : draft.event === "label" ? (
              <Labeled label="Label">
                <Input
                  value={draft.value}
                  placeholder="Any label"
                  onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                />
              </Labeled>
            ) : null}
          </div>
          <Labeled label="Task" hint="What the agent should do. The issue is attached as data.">
            <textarea
              className={cn(field, "min-h-24")}
              value={draft.task}
              onChange={(event) => setDraft({ ...draft, task: event.target.value })}
            />
          </Labeled>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={draft.teamKey === "" || draft.task.trim() === ""}
              onClick={() =>
                void act((rpc) =>
                  rpc.call("linear_trigger_add", {
                    agentId: agent.id,
                    teamKey: draft.teamKey,
                    project: draft.project === "" ? null : draft.project,
                    event: draft.event,
                    value: draft.value.trim() === "" ? null : draft.value.trim(),
                    task: draft.task,
                  }),
                ).then(() => setDraft(null))
              }
            >
              Save
            </Button>
          </div>
        </div>
      )}
      <Rows
        empty="No Linear triggers."
        rows={triggers.map((trigger) => (
          <>
            <Checkbox
              checked={trigger.enabled}
              aria-label="Enabled"
              onCheckedChange={(checked) =>
                void act((rpc) =>
                  rpc.call("linear_trigger_toggle", { id: trigger.id, enabled: checked === true }),
                )
              }
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{describeTrigger(trigger)}</span>
              <span className="block truncate text-xs text-muted-foreground">{trigger.task}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Remove trigger"
              onClick={() =>
                void act((rpc) => rpc.call("linear_trigger_delete", { id: trigger.id }))
              }
            >
              <Icon name="Trash2" className="size-4" />
            </Button>
          </>
        ))}
      />
    </Section>
  );
}

function InstructionsTab({
  agent,
  projects,
  act,
}: {
  agent: AgentDto;
  projects: { id: string; name: string }[];
  act: (write: (rpc: Rpc) => Promise<unknown>) => Promise<void>;
}) {
  const navigate = useBbNavigate();
  const [form, setForm] = useState<AgentForm>(agent);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setForm(agent), [agent.id, agent.updatedAt]);
  // SAFETY: form is an AgentForm built from agent, so its own keys are AgentForm keys.
  const dirty = (Object.keys(form) as (keyof AgentForm)[]).some((key) => form[key] !== agent[key]);
  return (
    <Section title="Settings">
      <div className="rounded-lg border border-border bg-card px-4 pb-4">
        <AgentFields form={form} projects={projects} onChange={setForm} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {confirming ? (
          <span className="flex items-center gap-2 text-sm">
            Delete the agent with its memory and automations?
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                void act((rpc) => rpc.call("agent_delete", { id: agent.id })).then(() =>
                  navigate.toPluginPanel(PANEL, { subPath: "", replace: true }),
                );
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setConfirming(true)}
          >
            Delete agent
          </Button>
        )}
        <Button
          disabled={!dirty || form.name.trim() === "" || form.projectId === ""}
          onClick={() =>
            void act((rpc) =>
              rpc.call("agent_update", {
                id: agent.id,
                name: form.name,
                description: form.description,
                projectId: form.projectId,
                instructions: form.instructions,
                enabled: form.enabled,
                httpTrigger: form.httpTrigger,
              }),
            )
          }
        >
          Save
        </Button>
      </div>
    </Section>
  );
}

/**
 * What a Staff member is and may do, read-only: their Charter file. A change opens a pull request
 * (ADR-0065); the Settings tab holds only what Optio overrides without review.
 */
function CharterTab({ agent }: { agent: AgentDto }) {
  const { rpc, value, error, report } = useLoaded(
    (r) => r.call("agent_charter", { id: agent.id }),
    `charter-${agent.id}`,
  );
  const [by, setBy] = useName();
  return (
    <Section title={value?.file ?? "Charter"}>
      <Problem message={error} />
      {value === null ? (
        error === null ? (
          <Empty>Loading…</Empty>
        ) : null
      ) : value.content === null ? (
        <Empty>
          {agent.name} has no Charter file. A Staff member is defined by their Charter in the
          repository.
        </Empty>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Read-only. Their tools, access, what they own and what they must never do change by a
            reviewed pull request, not here.
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card px-4 py-3 text-xs">
            {value.content}
          </pre>
          <Labeled label="Your name, recorded with each change">
            <Input
              className="max-w-xs"
              value={by}
              onChange={(event) => setBy(event.target.value)}
              placeholder="Name"
            />
          </Labeled>
          <ProposeChange
            what={`${agent.name}'s Charter`}
            by={by}
            proposals={value.proposals}
            onPropose={(text) => rpc.call("agent_propose", { id: agent.id, text, by: by.trim() })}
            onError={report}
          />
        </>
      )}
    </Section>
  );
}

const TABS = ["Chat", "Memory", "Automations", "Charter", "Settings"] as const;

function AgentDetail({ id }: { id: string }) {
  const { rpc, value, error, report, act } = useLoaded(
    async (r) => ({
      ...(await r.call("agent_get", { id })),
      projects: (await r.call("agents_list")).projects,
    }),
    id,
  );
  const [tab, setTab] = useState<(typeof TABS)[number]>("Chat");
  return (
    <Page>
      <Back to="" label="Staff" />
      <Problem message={error} />
      {value === null ? (
        error === null ? (
          <div className="mt-4">
            <Empty>Loading…</Empty>
          </div>
        ) : null
      ) : (
        <>
          <h1 className="mt-3 text-base font-medium">{value.agent.name}</h1>
          <p className="text-sm text-muted-foreground">{value.agent.description}</p>
          <div className="mt-4 flex gap-1 border-b border-border" role="tablist">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm",
                  tab === name
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setTab(name)}
              >
                {name}
                {name === "Memory" ? ` (${value.memories.length})` : null}
                {name === "Automations"
                  ? ` (${value.automations.length + value.linearTriggers.length})`
                  : null}
              </button>
            ))}
          </div>
          {tab === "Chat" ? (
            <ChatTab agent={value.agent} sessions={value.sessions} rpc={rpc} report={report} />
          ) : null}
          {tab === "Memory" ? (
            <MemoryTab agent={value.agent} memories={value.memories} act={act} />
          ) : null}
          {tab === "Automations" ? (
            <>
              <AutomationsTab
                agent={value.agent}
                automations={value.automations}
                act={act}
                rpc={rpc}
                report={report}
              />
              <LinearTriggers agent={value.agent} triggers={value.linearTriggers} act={act} />
              <FollowUps followUps={value.followUps} act={act} />
            </>
          ) : null}
          {tab === "Charter" ? <CharterTab agent={value.agent} /> : null}
          {tab === "Settings" ? (
            <>
              <OperatingSettings agent={value.agent} />
              <InstructionsTab agent={value.agent} projects={value.projects} act={act} />
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}

/** In every composer: pick an agent to address, which inserts its @-mention. */
export function AgentPicker() {
  const composer = useComposer();
  const { value } = useLoaded((rpc) => rpc.call("agents_list"), "picker");
  const choices = (value?.agents ?? []).filter((agent) => agent.enabled);
  if (choices.length === 0) return null;
  return (
    <select
      aria-label="Address an agent"
      title="Address an agent"
      className="h-8 max-w-28 cursor-pointer rounded-md border-0 bg-transparent px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none"
      value=""
      onChange={(event) => {
        const agent = choices.find((candidate) => candidate.id === event.target.value);
        if (agent === undefined) return;
        composer.insert([{ provider: "agent", id: agent.id, label: agent.name }, " "]);
        composer.focus();
      }}
    >
      <option value="">Agent</option>
      {choices.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  );
}

/** The Staff page: the agent list, one agent, or a view another area hands in by its sub-path. */
export function Agents({
  subPath,
  views,
}: {
  subPath: string;
  views: Readonly<Record<string, ComponentType>>;
}) {
  const path = subPath.replace(/^\/+|\/+$/g, "");
  if (path === "") return <StaffList />;
  if (path === "new") return <NewAgent />;
  if (Object.hasOwn(views, path)) {
    const View = views[path];
    if (View !== undefined) return <View />;
  }
  return <AgentDetail id={path} />;
}
