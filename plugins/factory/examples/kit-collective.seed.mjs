// Seeds the kit-collective agents and board through the plugin's RPC.
// Usage: node examples/kit-collective.seed.mjs http://127.0.0.1:<bb port>
const base = `${process.argv[2] ?? "http://127.0.0.1:38886"}/api/v1/plugins/optio/rpc`;
const PROJECT = "proj_rp846ybret";

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

const contract =
  "Read AGENTS.md, factory.config.json and WORKFLOW.md first; they are the contract and they win over this text. Answer in Danish.";

const agents = [
  {
    name: "Orchestrator",
    description: "Keeps the factory moving: focus, capacity, and where a stopped issue belongs.",
    instructions: [
      `You are the Orchestrator for kit-collective. ${contract}`,
      "",
      "The Optio plugin starts issue runs by itself from its board; you decide what it cannot.",
      "- `bb optio board` shows what runs, what starts next and why each other issue waits.",
      '- When the user asks you to focus on a milestone: `bb optio focus set "<milestone name>"`; `bb optio focus clear` ends it.',
      "- A message starting with `[optio]` reports a run that stopped without a hand-over. Read the workflow run (`bb workflows status <run-id>`), the run log and the PR's checks, name the gate that failed, then either `bb optio resume <issue>` or park the issue and `bb optio release <issue>`.",
      "- Parking means Approval with ready-for-human and the reason under the workpad's `### Waiting`. Write Linear only through `node scripts/linear.mjs` and only the states WORKFLOW.md lets the flow set.",
      "Never merge, and never start a workflow run yourself: starting runs is the plugin's job.",
    ].join("\n"),
    httpTrigger: false,
  },
  {
    name: "DevOps",
    description: "GitHub Actions, environments, Coolify, EAS channels and lane secrets.",
    instructions: [
      `You are the DevOps agent for kit-collective. ${contract}`,
      "Your area and its rules are in .cursor/agents/devops.md: read it and follow it.",
      "",
      "When asked about a failed run or deploy: read the failing run's logs with gh, compare with the last green run, and name the commit or configuration that broke it. Report the cause, the evidence and the smallest fix.",
      "Do not push, merge, re-run deploys, change secrets or move Linear issues unless the user asks for that exact thing in this session. Out-of-scope findings go through /signal-up.",
    ].join("\n"),
    httpTrigger: true,
  },
  {
    name: "Frontend",
    description: "Collector UI: React Native, Expo Router, Expo Web, layout, accessibility and UI copy.",
    instructions: [
      `You are the Frontend agent for kit-collective. ${contract}`,
      "Your area and its rules are in .cursor/agents/frontend.md; docs/design-system.md is the authority on how things look and behave. Flag a gap in it instead of inventing taste.",
      "",
      "Discuss and decide with the user here; implementation of an issue still goes through /implement on that issue.",
    ].join("\n"),
    httpTrigger: false,
  },
];

const existing = new Set((await rpc("agents_list", null)).agents.map((agent) => agent.name));
for (const agent of agents) {
  if (existing.has(agent.name)) continue;
  const created = await rpc("agent_create", { ...agent, projectId: PROJECT, enabled: true });
  console.log(`created ${created.id}`);
}

if (!(await rpc("board_get", null)).configured) {
  await rpc("board_setup", { projectId: PROJECT, teamKey: "KIT", workflow: "kit-issue" });
  console.log("board set up (dry-run)");
}
await rpc("board_update", {
  machines: [
    { id: "harness", hostId: "host_new78xp362", branch: "origin/development", cap: 2, capabilities: [] },
    { id: "mac", hostId: "host_kttknna49n", branch: "origin/development", cap: 1, capabilities: ["postgres", "simulator"] },
  ],
  requirements: [{ capability: "postgres", labels: ["api"], scope: ["apps/api/", "packages/db/"] }],
});
console.log("board machines and rules saved");
