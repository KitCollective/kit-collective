export const meta = {
  name: "kit-slice",
  description:
    "Factory Workflow: Implementing then Checker inventory/delta with cheap hold. ACP Cursor on kit-harness. No Pi.",
  inputSchema: {
    type: "object",
    required: ["issueId"],
    additionalProperties: false,
    properties: {
      issueId: { type: "string" },
      machine: { type: "string" },
      phase: { enum: ["implementing", "checker"] },
      prUrl: { type: "string" },
      lastReviewSha: { type: "string" },
      openClasses: {
        type: "array",
        items: { type: "string" },
      },
      requiredChecksPending: { type: "boolean" },
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
      status: { enum: ["In Review", "Implementing", "Ready for merge"] },
      provider: { const: "acp-cursor" },
      machine: { type: "string" },
      prUrl: { type: "string" },
      reviewColor: { enum: ["red", "amber", "green"] },
      cheapHold: { type: "boolean" },
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
    {
      title: "Checker",
      detail:
        "Inventory on pass 1, Delta later, cheap hold when required checks pending",
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

async function runChecker(prUrl) {
  phase("Checker");
  if (args.requiredChecksPending) {
    return {
      issueId: issueId,
      status: "In Review",
      provider: "acp-cursor",
      machine: machine,
      prUrl: prUrl,
      reviewColor: "amber",
      cheapHold: true,
    };
  }

  const mode = args.lastReviewSha ? "Delta" : "Inventory";
  const range = args.lastReviewSha
    ? args.lastReviewSha + "...HEAD"
    : "merge-base...HEAD";
  const open =
    Array.isArray(args.openClasses) && args.openClasses.length > 0
      ? args.openClasses.join("; ")
      : "(none)";

  const reviewed = await agent(
    [
      "Run the Checker phase of kit-slice for " + issueId + " on " + prUrl + ".",
      "Pass 1 is Inventory of merge-base...HEAD. Write Review pin and Review color.",
      "Later passes are Delta of open classes plus lastReviewSha...HEAD.",
      "This wake is " + mode + " over " + range + ". Open classes: " + open + ".",
      "If required checks are pending, record cheap hold and do not send a model review.",
      "Red returns Implementing on the same branch/PR.",
      "Green moves Ready for merge only when MERGEABLE and required checks are green.",
      "This path must not use a Pi worker.",
    ].join("\n"),
    {
      label: "checker:" + issueId,
      phase: "Checker",
      provider: "acp-cursor",
      model: "default",
      reasoningLevel: "medium",
      schema: {
        type: "object",
        required: ["status", "reviewColor"],
        additionalProperties: false,
        properties: {
          status: { enum: ["In Review", "Implementing", "Ready for merge"] },
          reviewColor: { enum: ["red", "amber", "green"] },
          cheapHold: { type: "boolean" },
        },
      },
    },
  );

  return {
    issueId: issueId,
    status: reviewed.status,
    provider: "acp-cursor",
    machine: machine,
    prUrl: prUrl,
    reviewColor: reviewed.reviewColor,
    cheapHold: reviewed.cheapHold === true,
  };
}

if (args.phase === "checker") {
  const prUrl = args.prUrl || "";
  if (!prUrl) {
    return {
      issueId: issueId,
      status: "Implementing",
      provider: "acp-cursor",
      machine: machine,
      prUrl: "",
    };
  }
  return await runChecker(prUrl);
}

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
    "Do not change Linear status. Mechanical close owns the In Review flip.",
    "Do not merge. Do not tick description Acceptance criteria.",
    "This path must not use a Pi worker.",
    "Return prUrl and whether the workpad exists.",
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

if (!implemented.workpad || !implemented.prUrl) {
  return {
    issueId: issueId,
    status: "Implementing",
    provider: "acp-cursor",
    machine: machine,
    prUrl: implemented.prUrl || "",
  };
}

phase("Mechanical close");
const closed = await agent(
  [
    "Run Mechanical close for " + issueId + " on " + implemented.prUrl + ".",
    "Rebase onto the integration lane until MERGEABLE.",
    "Run the full test graph and typecheck touched packages.",
    "Wait until every required GitHub check is green or skipped-by-design.",
    "Only this step may move Linear to In Review, and only after those checks plus workpad and PR evidence.",
    "Do not flip Linear status if checks are pending or red, or if workpad or PR evidence is missing.",
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

if (closed.status !== "In Review") {
  return {
    issueId: issueId,
    status: closed.status,
    provider: "acp-cursor",
    machine: machine,
    prUrl: implemented.prUrl,
  };
}

return await runChecker(implemented.prUrl);
