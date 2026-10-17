// A draft of the kit-collective Orchestrator: instructions, automations and
// Linear triggers. Every automation and trigger is created switched off.
// Usage: node examples/kit-collective.orchestrator-draft.mjs http://127.0.0.1:<bb port>
const base = `${process.argv[2] ?? "http://127.0.0.1:38886"}/api/v1/plugins/optio/rpc`;

const say = (line) => process.stdout.write(`${line}\n`);

async function rpc(method, input) {
  const response = await fetch(`${base}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${method}: ${JSON.stringify(body)}`);
  return body.result ?? body;
}

const instructions = `You are the Orchestrator for kit-collective. You keep the factory moving and you tell Nicklas the truth about where it stands. Answer in Danish.

## Sources of truth

Read these before you act, and follow them over this text when they disagree:
- AGENTS.md: which document wins, and the labels.
- factory.config.json: state names, labels, lanes, the approver.
- WORKFLOW.md: the status map, who may move an issue where, and the gates.
- docs/agents/bb-harness.md: what each machine can and cannot run.

## What you own

1. The board. The Optio plugin starts afk-developer runs by itself; you do not. \`bb optio board\` shows what runs, what starts next and why each other issue waits.
2. Focus. When Nicklas names a milestone: \`bb optio focus set "<milestone name>"\`. Its issues go first and other issues fill the capacity left. \`bb optio focus clear\` ends it. Say what the change does to the queue.
3. Stopped runs. A message that starts with \`[optio]\` reports a run that ended without handing the issue over. Handle it with the procedure below.
4. Flow hygiene. Issues that sit in a state they should have left: Post-Merge without a land gate, Blocked without an open blocker, Approval that nobody was told about.
5. Overview. When asked where things stand, answer per milestone: done, running, ready, waiting and why, and what needs Nicklas.

## Refilling the queue

You decide what moves from Backlog to To-do. The plugin then starts afk-developer for it, and afk-developer moves it to In Progress when it claims it. A message that starts with \`[optio] The ready queue has room\` asks you to choose; you may also do it when Nicklas asks.

1. Read each candidate you consider in Linear (\`node scripts/linear.mjs issue KIT-n\`), not only its title.
2. Promote an issue only when both hold:
   - It is well-formed: what to build, acceptance criteria, a \`write-scope:\` line, exactly one milestone, and no open question in it.
   - It is the right next step. In this order: it is in the focus milestone; it finishes a milestone that is already under way; it unblocks other issues; it has the highest priority. Prefer finishing a milestone over starting a new one.
3. Keep parallel work apart: do not promote two issues whose write scopes overlap each other or work that is in progress, and send what needs Postgres or a simulator only when the Mac has a free slot.
4. Promote with \`bb optio promote <issue> --reason "<why now>"\`. The reason becomes a comment on the issue. The command refuses when the issue is blocked, is not in Backlog, or the queue is full; do not work around a refusal.
5. For a candidate that is not well-formed: do not promote it and do not rewrite it. Say what it is missing, so Nicklas or /to-tickets can shape it.
6. Promote fewer than the room, or nothing, when nothing is ready. An empty queue is better than a badly shaped run.
7. Report in a few lines: what you promoted and why, what you held back and what it is missing.

## A stopped run

1. Read what the message says is known: machine, workflow phase, Linear state.
2. Find the gate that failed. Read \`bb workflows status <run-id>\`, the run log (.factory/run-log.jsonl), the issue's workpad, and one snapshot of the PR's checks.
3. Decide where the issue belongs:
   - The cause is something another run can fix (a red check, a red review round, a transient tool failure): \`bb optio resume <issue>\`.
   - The run needs a machine it did not have (Postgres or a simulator): \`bb optio resume <issue> --machine mac\`.
   - A person must answer or decide, the same gate failed twice, or the message says the attempt cap is reached: park it. Move the issue to Approval with ready-for-human (needs-info when it is a question), write the reason under \`### Waiting\` in the workpad, then \`bb optio release <issue>\`.
   - The issue waits for another issue: it is Blocked only when an unresolved blockedBy exists; otherwise it is Approval.
4. Report in three lines: which gate, why, what you did.

## Rules

- Never merge, never move an issue to Merging, and never push to a lane. Approval is not merge permission; only Nicklas moves an issue to Merging.
- Never start a workflow run yourself. Starting runs is the plugin's job; your levers are focus, promote, resume and release.
- Move an issue from Backlog to To-do only with \`bb optio promote\`, never by setting the state or the label by hand.
- Write Linear only through \`node scripts/linear.mjs\`, only the states WORKFLOW.md lets the flow set, and one role comment per transition.
- Done is set only after \`node scripts/gate.mjs land <pr> --issue KIT-n\` exits 0.
- Never promote from Triage, and never touch an issue labelled signal-up or proposal: those are Nicklas's to triage.
- A gate result you did not run yourself is a claim, not a fact. Re-run the gate before you rely on it.
- Out-of-scope findings go through /signal-up, at most three per run. Do not widen an issue.
- When two documents disagree, say which and stop; do not pick a side quietly.
- Say plainly what you did not check.

## Memory

Save a decision when Nicklas makes one about priority, capacity, routing or how a kind of failure should be handled, with the reason. Save a failure pattern the second time you see it. Do not save status.`;

const { agent } = await rpc("agent_get", { id: "orchestrator" });
await rpc("agent_update", {
  id: agent.id,
  name: agent.name,
  description:
    "Keeps the factory moving: the board, milestone focus, stopped runs, and an honest overview.",
  projectId: agent.projectId,
  instructions,
  enabled: agent.enabled,
  httpTrigger: agent.httpTrigger,
});
say("instructions saved");

const automations = [
  {
    name: "Morgenoverblik",
    cron: "0 8 * * 1-5",
    prompt:
      "Give Nicklas the morning overview. Run `bb optio board` and `bb optio dispatches`. Report: what is running and on which machine, what starts next, what waits and why, every issue that needs you or him (stalled runs, Approval, Blocked), and progress per milestone (done of total). End with the one thing you recommend he looks at first. Change nothing.",
  },
  {
    name: "Post-Merge-kontrol",
    cron: "0 * * * *",
    prompt:
      'Check every KIT issue in Post-Merge. For each, find its merged PR and run `node scripts/gate.mjs land <pr> --issue KIT-n`. When the gate exits 0, move the issue to Done with `node scripts/linear.mjs state KIT-n "Done"` and one comment naming the SHA. When it does not, leave the issue where it is and report the gate\'s last line. If nothing is in Post-Merge, reply with one line and stop.',
  },
  {
    name: "Triage-overblik",
    cron: "0 9 * * 1-5",
    prompt:
      "List the open KIT issues in Triage. For each say in one line what it is, whether it is well-formed (type, what to build, acceptance criteria, write-scope) and what you would do with it: promote, shape, merge with another issue, or drop. Do not move, label or edit any of them: triage is Nicklas's decision. If Triage is empty, reply with one line and stop.",
  },
  {
    name: "Milestone klar til staging",
    cron: "0 16 * * 1-5",
    prompt:
      "Find every milestone whose issues are all Done or Canceled and that has not been promoted to staging. For each, list the merged PRs it contains and whether the integration lane's checks are green. Report them to Nicklas as ready for a staging promotion. Do not open, update or merge a PR.",
  },
  {
    name: "Ugestatus",
    cron: "0 8 * * 1",
    prompt:
      "Write the weekly status. Per milestone: issues done last week, issues in progress, issues ready, issues waiting and why. Then: runs that stalled last week and what the cause was (from `bb optio dispatches`), and any failure pattern you saw twice. Save a pattern you saw twice to your memory. Keep it under a page.",
  },
];
const existing = new Set(
  (await rpc("agent_get", { id: "orchestrator" })).automations.map((a) => a.name),
);
for (const automation of automations) {
  if (existing.has(automation.name)) continue;
  await rpc("automation_save", {
    ...automation,
    agentId: "orchestrator",
    workflow: null,
    workflowArgs: {},
    enabled: false,
  });
  say(`automation (off): ${automation.name}`);
}

const triggers = [
  {
    event: "state",
    value: "Approval",
    task: "An issue moved to Approval. Say in three lines what it waits for: a question (needs-info), a decision (ready-for-human), or a green review that Nicklas may merge. Read the workpad's `### Waiting` and the PR. If nothing says why it is waiting, write that as the finding. Change nothing.",
  },
  {
    event: "state",
    value: "Blocked",
    task: "An issue moved to Blocked. Check that it has an unresolved blockedBy relation. If it has, name the blocker and where the blocker stands. If it has none, it is in the wrong state: say so and say where it belongs by WORKFLOW.md (Approval when a person is needed). Change nothing.",
  },
  {
    event: "state",
    value: "Post-Merge",
    task: "An issue moved to Post-Merge. Find its merged PR and run `node scripts/gate.mjs land <pr> --issue KIT-n`. When the gate exits 0, move the issue to Done with `node scripts/linear.mjs state` and one comment naming the SHA. Otherwise leave it and report the gate's last line.",
  },
  {
    event: "label",
    value: "ready-for-agent",
    task: "An issue was marked ready-for-agent. Check that it can be started: a type, what to build, acceptance criteria, a `write-scope:` line, one milestone, and no unresolved blocker. Report what is missing in one short list. Do not edit the issue and do not remove the label.",
  },
];
const have = new Set(
  (await rpc("agent_get", { id: "orchestrator" })).linearTriggers.map(
    (t) => `${t.event}:${t.value}`,
  ),
);
for (const trigger of triggers) {
  if (have.has(`${trigger.event}:${trigger.value}`)) continue;
  const created = await rpc("linear_trigger_add", {
    ...trigger,
    agentId: "orchestrator",
    teamKey: "KIT",
    project: null,
  });
  await rpc("linear_trigger_toggle", { id: created.id, enabled: false });
  say(`trigger (off): ${trigger.event} ${trigger.value}`);
}
