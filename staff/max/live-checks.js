// Max's live checks (staff/max.md, "Live checks"). A bb script automation, every 10 minutes, on the bb
// server host (the owner's Mac, where Optio runs), with the main checkout as working directory.
//
// An issue that names checks on a `live-check:` line (scripts/lib/live-checks.mjs) has them run here
// once its PR is merged (Post-Merge or Done): the main checkout is fast-forwarded to origin/development
// first, then each check runs with `node scripts/live-check.mjs run <name>`. The result goes on the issue
// as one comment by Max. Any failure moves the issue to Approval with ready-for-human and mentions
// Nicklas, since what merged does not work where it lives. Each issue's checks run once per merge
// commit; a run with nothing to check prints nothing (a silent, free run).
//
// The stored copy inside bb is a snapshot: after a change here, run
//   bb automation update <id> --project <project> --script-file staff/max/live-checks.js
// Env: DRY_RUN=1 lists what it would run and changes nothing. RUNS_MACHINE, LOOKBACK_DAYS override defaults.
// Written without static imports or import.meta so it runs whether bb stores it as CJS or ESM.

(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { execFileSync, spawnSync } = await import("node:child_process");

  const dryRun = process.env.DRY_RUN === "1";
  const runsMachine = process.env.RUNS_MACHINE ?? "host_new78xp362";
  const lookbackDays = Number(process.env.LOOKBACK_DAYS ?? 3);
  const bb = process.env.BB_CLI ?? "bb";
  const NICKLAS = "https://linear.app/kitcollective/profiles/nicklas";
  const statePath = path.join(path.dirname(process.argv[1]), "max-live-checks.state");
  const run = (cmd, args, options = {}) =>
    execFileSync(cmd, args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
  const linear = (...args) =>
    run("node", ["scripts/linear.mjs", ...args], { env: { ...process.env, LINEAR_ACTOR: "max" } });
  const comment = (issue, body) => {
    const file = path.join(os.tmpdir(), `max-live-checks-${process.pid}.md`);
    fs.writeFileSync(file, body);
    try {
      linear("comment", issue, "--body-file", file);
    } finally {
      fs.rmSync(file, { force: true });
    }
  };

  let key = process.env.LINEAR_API_KEY;
  if (!key && fs.existsSync(".env")) {
    const match = /^\s*(?:export\s+)?LINEAR_API_KEY\s*=\s*(.*)\s*$/m.exec(
      fs.readFileSync(".env", "utf8"),
    );
    key = match?.[1].replace(/^(['"])(.*)\1$/, "$2");
  }
  if (!key) throw new Error(`LINEAR_API_KEY is not set and not in ${path.resolve(".env")}`);

  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({
      query: `query($since: DateTimeOrDuration!) { issues(first: 50, filter: {
        team: { key: { eq: "KIT" } }, state: { name: { in: ["Post-Merge", "Done"] } },
        updatedAt: { gte: $since }, description: { containsIgnoreCase: "live-check:" }
      }) { nodes { identifier description } } }`,
      variables: { since },
    }),
  });
  const data = await response.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors).slice(0, 300));
  const { parseLiveChecks } = await import(path.resolve("scripts/lib/live-checks.mjs"));

  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {}

  // The merge commit of each issue's PR: a check runs once per merge, again only after a new one.
  const todo = [];
  for (const issue of data.data.issues.nodes) {
    const names = parseLiveChecks(issue.description);
    if (names.length === 0) continue;
    const prs = JSON.parse(
      run("gh", [
        "pr",
        "list",
        "--state",
        "merged",
        "--search",
        `${issue.identifier} in:title`,
        "--json",
        "title,mergeCommit,headRefName",
        "--limit",
        "5",
      ]),
    ).filter((pr) => pr.title.startsWith(`${issue.identifier}:`));
    const pr = prs[0];
    const merge = pr?.mergeCommit?.oid;
    if (!merge || state[issue.identifier] === merge) continue;
    todo.push({ issue: issue.identifier, names, merge });
  }
  if (todo.length === 0) return;
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: would run ${todo.map((t) => `${t.issue} [${t.names.join(", ")}]`).join("; ")}\n`,
    );
    return;
  }

  // The checkout must hold the merged code: development, fast-forwarded. A checkout elsewhere is reported, never moved.
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "development") {
    process.stdout.write(
      `live checks waiting: the main checkout is on ${branch}, not development\n`,
    );
    process.exit(1);
  }
  run("git", ["fetch", "-q", "origin", "development"]);
  run("git", ["merge", "-q", "--ff-only", "origin/development"]);

  // A thread on the runs machine for checks that probe one (any thread whose worktree is on development).
  let thread;
  try {
    const listed = JSON.parse(run(bb, ["thread", "list", "--machine", runsMachine, "--json"]));
    thread = (Array.isArray(listed) ? listed : (listed.threads ?? [])).find(
      (t) => t.status === "idle" && t.environmentId,
    )?.id;
  } catch {}

  const out = [];
  for (const { issue, names, merge } of todo) {
    const results = names.map((name) => {
      const args = ["scripts/live-check.mjs", "run", name, ...(thread ? ["--thread", thread] : [])];
      const result = spawnSync("node", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      const line =
        String(result.stdout ?? "")
          .trim()
          .split("\n")
          .at(-1) || `LIVE-CHECK ${name} fail no verdict line`;
      return { name, pass: result.status === 0, line };
    });
    const failed = results.filter((r) => !r.pass);
    const body = [
      `Max: live checks after the merge (${merge.slice(0, 7)}), run from the main checkout on the bb server:`,
      "",
      ...results.map(
        (r) => `- \`${r.name}\`: ${r.pass ? "pass" : "**fail**"}. \`${r.line.replace(/`/g, "'")}\``,
      ),
      ...(failed.length > 0
        ? [
            "",
            "What merged does not work where it runs. Back to Approval for a person.",
            "",
            NICKLAS,
          ]
        : []),
    ].join("\n");
    comment(issue, body);
    if (failed.length > 0) {
      linear("state", issue, "Approval");
      linear("label", issue, "add", "ready-for-human");
    }
    state[issue] = merge;
    fs.writeFileSync(statePath, JSON.stringify(state));
    out.push(`${issue}: ${results.map((r) => `${r.name} ${r.pass ? "pass" : "fail"}`).join(", ")}`);
  }
  process.stdout.write(`${out.join("; ")}\n`);
})().catch((error) => {
  process.stderr.write(`max-live-checks: ${error.message}\n`);
  process.exit(1);
});
