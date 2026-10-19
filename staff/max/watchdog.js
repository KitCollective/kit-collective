// Max's watchdog (staff/max.md, "Watchdog"). A bb script automation, every 10 minutes, that checks the
// things that kept Max out of play on 2026-10-17 without anyone noticing: the dispatch tick was switched
// off after a host disconnect (09:07 to 14:22), and the runs machine's .env lacked Max's Linear keys
// (15:10 to 15:45), so Max could not read or write Linear as himself.
//
// Checks, each healed when it safely can be:
//   tick-off      the dispatch automation is disabled            -> resumed (not while Max is off or paused)
//   tick-failing  its last 3 runs failed                         -> alarm (with the last error)
//   tick-silent   no run of it finished in the last 20 minutes   -> alarm (not while Max is off or paused)
//   env-keys      the runs machine's .env lacks a required key   -> the missing lines are appended from
//                 this checkout's .env (values are never printed); alarm only if they are missing here too
//   max-stuck     a Max thread has been active for over 45 min   -> alarm
//   worktrees     worktrees of Done/Canceled issues on the runs machine -> reaped (ADR-0066)
// Max's Operating settings (KIT-408) are read first with `bb optio settings max --json`: while he is off or
// paused (his page's setting, a disabled agent or Optio's plugin-wide pause) the tick is held on purpose, so
// the watchdog neither resumes it nor calls it silent. Settings it cannot read change nothing: the checks
// run as before.
// An alarm is one comment on the alarm issue as Max, with Nicklas's profile URL so it reaches his Linear
// inbox. The same set of problems is not repeated within 6 hours, and a comment says when they cleared.
// A tick with nothing wrong and nothing healed prints nothing (a silent, free run).
//
// The stored copy inside bb is a snapshot: after a change here, run
//   bb automation update <id> --project <project> --script-file staff/max/watchdog.js
// Runs on the bb server host with the project checkout as working directory.
// Env: DRY_RUN=1 reports what it would do and changes nothing. TICK_AUTOMATION, BB_PROJECT_ID,
//      RUNS_MACHINE, RUN_CHECKOUT, ALARM_ISSUE override the defaults.
// Written without static imports or import.meta so it runs whether bb stores it as CJS or ESM.

(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const crypto = await import("node:crypto");
  const { execFileSync } = await import("node:child_process");

  const tick = process.env.TICK_AUTOMATION ?? "auto_bpnbeq2v6se";
  const project = process.env.BB_PROJECT_ID ?? "proj_ywcvj7w835";
  const machine = process.env.RUNS_MACHINE ?? "host_new78xp362";
  const runCheckout = process.env.RUN_CHECKOUT ?? "/home/node/work/kit-collective";
  const alarmIssue = process.env.ALARM_ISSUE ?? "KIT-395";
  const dryRun = process.env.DRY_RUN === "1";
  const bb = process.env.BB_CLI ?? "bb";
  const REQUIRED_KEYS = ["LINEAR_API_KEY", "LINEAR_MAX_CLIENT_ID", "LINEAR_MAX_CLIENT_SECRET"];
  const NICKLAS = "https://linear.app/kitcollective/profiles/nicklas";
  const statePath = path.join(path.dirname(process.argv[1]), "max-watchdog.state");

  const run = (cmd, args, options = {}) =>
    execFileSync(cmd, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
  const json = (args) => JSON.parse(run(bb, [...args, "--json"]));
  const problems = [];
  const healed = [];

  // Max's Operating settings: why the tick is held on purpose, or null (also when they cannot be read).
  let heldOnPurpose = null;
  try {
    const status = json(["optio", "settings", "max"]).status;
    if (status === "off" || status === "paused") heldOnPurpose = status;
  } catch {}

  // The dispatch tick: on, not failing, not silent.
  try {
    const automation = json(["automation", "show", tick, "--project", project]);
    if (!automation.enabled && heldOnPurpose === null) {
      if (!dryRun) run(bb, ["automation", "resume", tick, "--project", project]);
      healed.push(`tick-off: the dispatch automation ${tick} was disabled; resumed`);
    }
    const listed = json(["automation", "runs", tick, "--project", project]);
    const runs = (Array.isArray(listed) ? listed : (listed.runs ?? [])).filter(
      (r) => r.status !== "running" && r.status !== "queued",
    );
    const failing = runs.slice(0, 3);
    if (failing.length === 3 && failing.every((r) => r.status === "failed")) {
      const error = String(failing[0].error ?? failing[0].output ?? "")
        .split("\n")[0]
        .slice(0, 200);
      problems.push(
        `tick-failing: the last 3 dispatch runs failed (latest: ${error || "no error text"})`,
      );
    }
    const last = runs.find((r) => r.finishedAt);
    if (
      automation.enabled &&
      heldOnPurpose === null &&
      (!last || Date.now() - last.finishedAt > 20 * 60000)
    ) {
      problems.push(
        `tick-silent: no dispatch run finished since ${last ? new Date(last.finishedAt).toISOString() : "ever"}`,
      );
    }
  } catch (error) {
    problems.push(`tick-unreadable: ${String(error.message).split("\n")[0].slice(0, 200)}`);
  }

  // Max's Linear keys on the runs machine. The values move from this checkout's .env and are never printed.
  const keysIn = (text) =>
    new Set(
      String(text ?? "")
        .split("\n")
        .map((line) => /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*\S/.exec(line)?.[1])
        .filter(Boolean),
    );
  try {
    const remotePath = `${runCheckout}/.env`;
    const remote = json(["file", "read", remotePath, "--host", machine, "--root", runCheckout]);
    const have = keysIn(remote.content);
    const missing = REQUIRED_KEYS.filter((k) => !have.has(k));
    if (missing.length > 0) {
      const local = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
      const lines = local
        .split("\n")
        .filter((line) => missing.includes(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line)?.[1]));
      const found = keysIn(lines.join("\n"));
      const stillMissing = missing.filter((k) => !found.has(k));
      if (lines.length > 0) {
        if (!dryRun) {
          const body = `${String(remote.content ?? "").replace(/\n*$/, "\n")}${lines.join("\n")}\n`;
          run(
            bb,
            ["file", "write", remotePath, "--host", machine, "--root", runCheckout, "--stdin"],
            {
              input: body,
            },
          );
        }
        healed.push(`env-keys: copied ${[...found].join(", ")} to ${machine}:${remotePath}`);
      }
      if (stillMissing.length > 0) {
        problems.push(
          `env-keys: ${stillMissing.join(", ")} missing on ${machine} and in ${path.resolve(".env")}`,
        );
      }
    }
  } catch (error) {
    problems.push(`env-unreadable: ${String(error.message).split("\n")[0].slice(0, 200)}`);
  }

  // A Max thread that never went idle.
  try {
    const listed = json(["thread", "list", "--project", project]);
    const threads = Array.isArray(listed) ? listed : (listed.threads ?? []);
    for (const t of threads) {
      // Max's daily thread ("Max · 2026-10-17") lives all day, so a hang is an active thread with no
      // event for 45 minutes, not an old one. The older per-wake titles ("Max 2026-10-17 17:25") match too.
      if (!/^Max (· )?\d{4}-\d{2}-\d{2}/.test(t.title ?? "") || t.status !== "active") continue;
      const quiet = Date.now() - Number(t.updatedAt ?? 0);
      if (quiet > 45 * 60000)
        problems.push(`max-stuck: ${t.id} (${t.title}) active with no event for over 45 minutes`);
    }
  } catch (error) {
    problems.push(`threads-unreadable: ${String(error.message).split("\n")[0].slice(0, 200)}`);
  }

  // Worktrees (ADR-0066): reap the runs machine's worktrees of finished issues. Quiet when there is
  // nothing to reap; a reap is reported as healed, a failure to read bb or Linear is not an alarm.
  if (fs.existsSync("scripts/reap-environments.mjs")) {
    try {
      const out = execFileSync(
        "node",
        ["scripts/reap-environments.mjs", ...(dryRun ? [] : ["--apply"]), "--machine", machine],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 240000 },
      );
      const summary = out.trim().split("\n").at(-1) ?? "";
      if (/(reaped|would reap) [1-9]/.test(summary)) healed.push(`worktrees: ${summary}`);
    } catch {}
  }

  // Alarm: once per set of problems per 6 hours, and once when it clears.
  const codes = problems.map((p) => p.split(":")[0]).sort();
  const fingerprint = crypto.createHash("sha256").update(codes.join(",")).digest("hex");
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {}
  const comment = (body) => {
    if (dryRun) return;
    const file = path.join(os.tmpdir(), `max-watchdog-${process.pid}.md`);
    fs.writeFileSync(file, body);
    try {
      run("node", ["scripts/linear.mjs", "comment", alarmIssue, "--body-file", file], {
        env: { ...process.env, LINEAR_ACTOR: "max" },
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  };
  const lines = [];
  if (problems.length > 0) {
    const repeat = state.fingerprint === fingerprint && Date.now() - (state.at ?? 0) < 6 * 3600000;
    if (!repeat) {
      comment(
        [
          "Max: watchdog alarm. Something keeps the factory from running on its own:",
          "",
          ...problems.map((p) => `- ${p}`),
          ...(healed.length > 0 ? ["", "Already healed:", ...healed.map((h) => `- ${h}`)] : []),
          "",
          NICKLAS,
        ].join("\n"),
      );
      if (!dryRun)
        fs.writeFileSync(statePath, JSON.stringify({ fingerprint, at: Date.now(), open: true }));
      lines.push(`alarm on ${alarmIssue}: ${codes.join(", ")}`);
    }
  } else if (state.open) {
    comment(
      [
        "Max: watchdog: clear. The dispatch tick runs and the keys are in place.",
        ...healed.map((h) => `- ${h}`),
      ].join("\n"),
    );
    if (!dryRun) fs.writeFileSync(statePath, JSON.stringify({ open: false, at: Date.now() }));
    lines.push(`cleared on ${alarmIssue}`);
  }
  lines.push(...healed.map((h) => `healed ${h}`));
  if (lines.length > 0) process.stdout.write(`${dryRun ? "DRY RUN: " : ""}${lines.join("; ")}\n`);
})().catch((error) => {
  process.stderr.write(`max-watchdog: ${error.message}\n`);
  process.exit(1);
});
