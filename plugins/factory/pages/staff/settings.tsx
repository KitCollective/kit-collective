// A Staff member's Operating settings (ADR-0065): what Optio overrides without review. Each setting
// shows the value in force, the Charter's value beside it, and, when someone overrode it, who and
// when with a "Use Charter" that falls back. A log of every change sits under the settings. Only a
// Staff member (an agent with a Charter) has them: for any other agent the call errors and the
// section does not render.
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentDto, StaffSettingsDto } from "../../src/staff/contract";
import { useName } from "../loops/propose";
import { when } from "../shared/common";
import { Empty, Labeled, Problem, Section } from "../shared/layout";
import type { Rpc } from "../shared/use-loaded";
import { useLoaded } from "../shared/use-loaded";

type KeyName = keyof StaffSettingsDto["settings"];
type Change = StaffSettingsDto["log"][number];

/** How a setting's value reads on the page and in the log. */
function show(key: string, value: unknown): string {
  if (typeof value === "boolean") {
    if (key === "paused") return value ? "paused" : "not paused";
    return value ? "on" : "off";
  }
  if (value === null || value === undefined) {
    if (key === "heartbeat") return "as the Charter says";
    if (key === "budget") return "none";
    return "none named";
  }
  if (typeof value === "object" && "from" in value && "to" in value) {
    return `${String(value.from)}–${String(value.to)} UTC`;
  }
  return String(value);
}

const LABELS: Record<KeyName, string> = {
  enabled: "On or off",
  paused: "Paused",
  model: "Model",
  budget: "Budget",
  heartbeat: "Heartbeat",
};

function SettingRow({
  label,
  hint,
  value,
  file,
  note,
  override,
  onClear,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  value: string;
  /** The Charter's value. */
  file: string;
  /** Extra Charter text beside the value, e.g. the heartbeat prose. */
  note?: string | null;
  override: { by: string; at: string } | null;
  onClear: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm">{value}</span>
        <span className="text-xs text-muted-foreground">Charter: {file}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {note ? <p className="text-xs text-muted-foreground">Charter says: {note}</p> : null}
      {override === null ? null : (
        <p className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          Set by {override.by} at {when(Date.parse(override.at))}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onClear}>
            Use Charter
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Log({ log }: { log: Change[] }) {
  const read = (key: string, change: Change["from"]) =>
    change === null ? "Charter" : show(key, change.value);
  return log.length === 0 ? (
    <Empty>No setting has been changed yet.</Empty>
  ) : (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {log.map((change) => (
        <li
          key={`${change.at}-${change.key}-${read(change.key, change.to)}`}
          className="px-4 py-2 text-sm"
        >
          <span className="font-medium">
            {Object.entries(LABELS).find(([name]) => name === change.key)?.[1] ?? change.key}
          </span>
          : {read(change.key, change.from)} → {read(change.key, change.to)}
          <span className="block text-xs text-muted-foreground">
            {change.by} · {when(Date.parse(change.at))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Rows({
  data,
  by,
  write,
}: {
  data: StaffSettingsDto;
  by: string;
  write: (key: KeyName, value: unknown | undefined) => Promise<void>;
}) {
  const { enabled, paused, model, budget, heartbeat } = data.settings;
  const [modelText, setModelText] = useState(model.value ?? "");
  const [budgetText, setBudgetText] = useState(budget.value ?? "");
  const [from, setFrom] = useState(heartbeat.value?.from ?? "08:00");
  const [to, setTo] = useState(heartbeat.value?.to ?? "18:00");
  const noName = by.trim() === "";
  const row = (key: KeyName) => {
    const setting = data.settings[key];
    return {
      value: show(key, setting.value),
      file: show(key, setting.file),
      override: setting.override,
      onClear: () => void write(key, undefined),
      disabled: noName,
    };
  };
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-1">
      <SettingRow
        label={LABELS.enabled}
        hint="Off stops new work at the next tick; on resumes it."
        {...row("enabled")}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={noName}
          onClick={() => void write("enabled", !enabled.value)}
        >
          {enabled.value ? "Turn off" : "Turn on"}
        </Button>
      </SettingRow>
      <SettingRow
        label={LABELS.paused}
        hint="A pause keeps the member on but holds back their work until resumed."
        {...row("paused")}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={noName}
          onClick={() => void write("paused", !paused.value)}
        >
          {paused.value ? "Resume" : "Pause"}
        </Button>
      </SettingRow>
      <SettingRow
        label={LABELS.model}
        hint="The model this member's sessions run on."
        {...row("model")}
      >
        <Input
          aria-label="Model"
          className="w-64"
          value={modelText}
          onChange={(event) => setModelText(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={noName || modelText.trim() === ""}
          onClick={() => void write("model", modelText.trim())}
        >
          Set
        </Button>
      </SettingRow>
      <SettingRow
        label={LABELS.budget}
        hint="The budget as written, for example 5 USD per day. Empty states none."
        {...row("budget")}
      >
        <Input
          aria-label="Budget"
          className="w-64"
          value={budgetText}
          onChange={(event) => setBudgetText(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={noName}
          onClick={() => void write("budget", budgetText.trim() === "" ? null : budgetText.trim())}
        >
          Set
        </Button>
      </SettingRow>
      <SettingRow
        label={LABELS.heartbeat}
        hint="The daily window, in UTC, in which Max's tick may wake this member. Use Charter returns to what the Charter says."
        note={data.charter.heartbeat}
        {...row("heartbeat")}
      >
        <Input
          aria-label="Heartbeat from"
          className="w-28"
          type="time"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          aria-label="Heartbeat to"
          className="w-28"
          type="time"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={noName || from === "" || to === ""}
          onClick={() => void write("heartbeat", { from, to })}
        >
          Set
        </Button>
      </SettingRow>
    </div>
  );
}

export function OperatingSettings({ agent }: { agent: AgentDto }) {
  const { value, error, act } = useLoaded(
    (rpc) => rpc.call("staff_settings", { agentId: agent.id }),
    `staff-settings-${agent.id}`,
  );
  const [by, setBy] = useName();
  // The call refuses an agent without a Charter: nothing to show for it.
  if (value === null) return null;
  const write = (key: KeyName, next: unknown | undefined) =>
    act((rpc: Rpc) =>
      next === undefined
        ? rpc.call("staff_settings_clear", { agentId: agent.id, key, by: by.trim() })
        : rpc.call("staff_settings_set", { agentId: agent.id, key, value: next, by: by.trim() }),
    );
  return (
    <>
      <Section title="Operating settings">
        <p className="mb-2 text-xs text-muted-foreground">
          What Optio overrides without review, from the next tick. The Charter's value shows beside
          each; Use Charter falls back to it. Rules and access stay in the Charter.
        </p>
        <Labeled label="Your name, recorded with each change">
          <Input
            className="max-w-xs"
            value={by}
            onChange={(event) => setBy(event.target.value)}
            placeholder="Name"
          />
        </Labeled>
        <Problem message={error} />
        <Rows key={JSON.stringify(value.settings)} data={value} by={by} write={write} />
      </Section>
      <Section title="Changes">
        <Log log={value.log} />
      </Section>
    </>
  );
}
