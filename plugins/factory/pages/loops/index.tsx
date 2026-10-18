// The Loops page: every Loop of the registry with its Operating settings. Each setting shows the
// value in force, the value in factory.config.json beside it, and, when someone overrode it, who and
// when with a Clear that falls back to the file. A log of every change sits under the Loops.
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoopChangeDto, LoopDto } from "../../src/loops/contract";
import { formatSetting } from "../../src/loops/format";
import { when } from "../shared/common";
import { Empty, Labeled, Page, Problem, Section } from "../shared/layout";
import { useLoaded } from "../shared/use-loaded";

type Settings = LoopDto["settings"];

const NAME_KEY = "optio.loops.by";

/** The RPC has no caller identity, so the page asks who is changing a setting and remembers it. */
function useName() {
  const [name, setName] = useState(() => globalThis.localStorage?.getItem(NAME_KEY) ?? "");
  const save = (next: string) => {
    setName(next);
    globalThis.localStorage?.setItem(NAME_KEY, next);
  };
  return [name, save] as const;
}

function SettingRow({
  label,
  hint,
  value,
  file,
  override,
  onClear,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  value: string;
  file: string;
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
        <span className="text-xs text-muted-foreground">file: {file}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {override === null ? null : (
        <p className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          Override by {override.by} at {when(Date.parse(override.at))}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onClear}>
            Clear
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function LoopCard({
  loop,
  by,
  write,
}: {
  loop: LoopDto;
  by: string;
  write: (key: string, value: unknown | undefined) => Promise<void>;
}) {
  const { enabled, maxLive, startsPerDay, schedule } = loop.settings;
  const [live, setLive] = useState(String(maxLive.value));
  const [starts, setStarts] = useState(
    startsPerDay.value === null ? "" : String(startsPerDay.value),
  );
  const [from, setFrom] = useState(schedule.value?.from ?? "08:00");
  const [to, setTo] = useState(schedule.value?.to ?? "18:00");
  const noName = by.trim() === "";
  const row = <K extends keyof Settings>(key: K) => ({
    value: formatSetting(key, loop.settings[key].value),
    file: formatSetting(key, loop.settings[key].file),
    override: loop.settings[key].override,
    onClear: () => void write(key, undefined),
    disabled: noName,
  });
  return (
    <section className="mt-4 rounded-lg border border-border bg-card px-4 py-3">
      <h2 className="text-sm font-semibold">{loop.name}</h2>
      <p className="text-xs text-muted-foreground">
        Runs the {loop.workflow} workflow. Starts from {loop.trigger.summary}.
      </p>
      <SettingRow
        label="On or off"
        hint="Off stops new runs at the next tick; on resumes them."
        {...row("enabled")}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={noName}
          onClick={() => void write("enabled", !enabled.value)}
        >
          {enabled.value ? "Pause" : "Resume"}
        </Button>
      </SettingRow>
      <SettingRow
        label="Live-run cap"
        hint="How many runs of this Loop may be live at once, 0 to 16."
        {...row("maxLive")}
      >
        <Input
          aria-label="Live-run cap"
          className="w-24"
          type="number"
          min={0}
          max={16}
          value={live}
          onChange={(event) => setLive(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={noName || live.trim() === ""}
          onClick={() => void write("maxLive", Number(live))}
        >
          Set
        </Button>
      </SettingRow>
      <SettingRow
        label="Starts per day"
        hint="How many times one issue may be started in 24 hours; empty is no cap."
        {...row("startsPerDay")}
      >
        <Input
          aria-label="Starts per day"
          className="w-24"
          type="number"
          min={1}
          value={starts}
          onChange={(event) => setStarts(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={noName}
          onClick={() => void write("startsPerDay", starts.trim() === "" ? null : Number(starts))}
        >
          Set
        </Button>
      </SettingRow>
      <SettingRow
        label="Schedule"
        hint="The daily window, in UTC, in which this Loop may start runs."
        {...row("schedule")}
      >
        <Input
          aria-label="Schedule from"
          className="w-28"
          type="time"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          aria-label="Schedule to"
          className="w-28"
          type="time"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={noName || from === "" || to === ""}
          onClick={() => void write("schedule", { from, to })}
        >
          Set
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={noName}
          onClick={() => void write("schedule", null)}
        >
          Any time
        </Button>
      </SettingRow>
    </section>
  );
}

function Log({ log }: { log: LoopChangeDto[] }) {
  const show = (key: string, change: LoopChangeDto["from"]) =>
    change === null ? "file" : formatSetting(key, change.value);
  return log.length === 0 ? (
    <Empty>No setting has been changed yet.</Empty>
  ) : (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {log.map((change) => (
        <li
          key={`${change.at}-${change.loop}-${change.key}-${show(change.key, change.to)}`}
          className="px-4 py-2 text-sm"
        >
          <span className="font-medium">{change.loop}</span> · {change.key}:{" "}
          {show(change.key, change.from)} →{" "}
          {change.to === null ? "file" : show(change.key, change.to)}
          <span className="block text-xs text-muted-foreground">
            {change.by} · {when(Date.parse(change.at))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Loops() {
  const { value, error, act } = useLoaded((rpc) => rpc.call("loops_list"), "loops");
  const [by, setBy] = useName();
  const write = (loop: string) => (key: string, next: unknown | undefined) =>
    act((rpc) =>
      next === undefined
        ? rpc.call("loops_clear", { loop, key, by: by.trim() })
        : rpc.call("loops_set", { loop, key, value: next, by: by.trim() }),
    );
  return (
    <Page>
      <h1 className="text-base font-semibold">Loops</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What starts each workflow and how much it may run. A change here overrides the value in
        factory.config.json from the next tick; Clear falls back to the file.
      </p>
      <Labeled label="Your name, recorded with each change">
        <Input
          className="max-w-xs"
          value={by}
          onChange={(event) => setBy(event.target.value)}
          placeholder="Name"
        />
      </Labeled>
      <Problem message={error ?? value?.error ?? null} />
      {value === null
        ? null
        : value.loops.map((loop) => (
            <LoopCard key={loop.name} loop={loop} by={by} write={write(loop.name)} />
          ))}
      <Section title="Changes">
        <Log log={value?.log ?? []} />
      </Section>
    </Page>
  );
}
