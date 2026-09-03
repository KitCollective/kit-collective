export const meta = {
  name: "kit-slice",
  description:
    "Implementing phase of Factory Workflow: /implement + TDD + Role subagents, mechanical close, then In Review. ACP Cursor on kit-harness. No Pi.",
  inputSchema: {
    type: "object",
    required: ["issueId"],
    additionalProperties: false,
    properties: {
      issueId: { type: "string" },
      machine: { type: "string" },
      roles: {
        type: "array",
        items: { enum: ["Frontend", "Backend", "DevOps"] },
      },
    },
  },
  outputSchema: {
    type: "object",
    required: ["issueId", "status", "provider", "machine"],
    additionalProperties: false,
    properties: {
      issueId: { type: "string" },
      status: { enum: ["In Review", "Implementing"] },
      provider: { const: "acp-cursor" },
      machine: { type: "string" },
      prUrl: { type: "string" },
    },
  },
  phases: [
    {
      title: "Implement",
      detail: "/implement + TDD + Role subagents on ACP Cursor",
    },
    {
      title: "Mechanical close",
      detail: "Rebase, full tests, required checks before In Review",
    },
  ],
};

const issueId = args.issueId;
const machine = args.machine || "kit-harness";
const roles = Array.isArray(args.roles) ? args.roles : [];
const roleLine =
  roles.length > 0
    ? roles.join(", ")
    : "Frontend, Backend, and/or DevOps when the slice matches (KIT-196)";

phase("Implement");
const implemented = await agent(
  [
    "Run the Implementing phase of kit-slice for " + issueId + ".",
    "Machine: " + machine + ". Provider: acp-cursor.",
    "Follow the /implement command contract: one workpad, one branch, one PR.",
    "Use Method skill TDD first at the spec seams.",
    "Spawn Role subagents as needed: " +
      roleLine +
      ". Area skills (Expo, Nest, design-system) load on demand — not as agent ids.",
    "Do not merge. Do not tick description Acceptance criteria.",
    "This path must not use a Pi worker.",
    "Return the PR URL after the implement work is on the branch.",
  ].join("\n"),
  {
    label: "implement:" + issueId,
    phase: "Implement",
    provider: "acp-cursor",
    model: "default",
    reasoningLevel: "medium",
    schema: {
      type: "object",
      required: ["prUrl", "workpad"],
      additionalProperties: false,
      properties: {
        prUrl: { type: "string" },
        workpad: { type: "boolean" },
      },
    },
  },
);

phase("Mechanical close");
const closed = await agent(
  [
    "Run Mechanical close for " + issueId + " on " + implemented.prUrl + ".",
    "Rebase onto the integration lane until MERGEABLE.",
    "Run the full test graph and typecheck touched packages.",
    "Wait until every required GitHub check is green or skipped-by-design.",
    "Do not flip Linear status yourself if checks are pending or red.",
    "When the gate is clean, attach workpad/PR evidence and move the issue to In Review.",
    "This path must not use a Pi worker.",
  ].join("\n"),
  {
    label: "close:" + issueId,
    phase: "Mechanical close",
    provider: "acp-cursor",
    model: "default",
    reasoningLevel: "medium",
    schema: {
      type: "object",
      required: ["status"],
      additionalProperties: false,
      properties: {
        status: { enum: ["In Review", "Implementing"] },
        reason: { type: "string" },
      },
    },
  },
);

return {
  issueId: issueId,
  status: closed.status,
  provider: "acp-cursor",
  machine: machine,
  prUrl: implemented.prUrl,
};
