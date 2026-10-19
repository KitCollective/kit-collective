import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIssue,
  createProjectComment,
  fillReviewMatrix,
  fillWaiting,
  LinearUsageError,
  listIssues,
  parseCreateArgs,
  parseProjectCommentArgs,
  parseReviewMatrixArgs,
  parseWaitingArgs,
  replaceWorkpadSection,
  reviewMatrixProblem,
  SCENARIO_FAILURE_FOOTER,
  sectionLines,
} from "../lib/linear-issues.mjs";
import { LOCK_ROWS } from "../lib/review-matrix.mjs";

const STATES = [
  { id: "s-backlog", name: "Backlog", type: "backlog" },
  { id: "s-todo", name: "To-do", type: "unstarted" },
  { id: "s-progress", name: "In Progress", type: "started" },
  { id: "s-post", name: "Post-Merge", type: "started" },
  { id: "s-done", name: "Done", type: "completed" },
  { id: "s-canceled", name: "Canceled", type: "canceled" },
  { id: "s-dup", name: "Duplicate", type: "canceled" },
];
const LABELS = [
  { id: "l-ready", name: "ready-for-agent", parent: { id: "g-triage", name: "Triage" } },
  { id: "l-info", name: "needs-info", parent: { id: "g-triage", name: "Triage" } },
  { id: "l-signal", name: "signal-up", parent: null },
  { id: "l-proposal", name: "proposal", parent: null },
  { id: "l-bug", name: "bug", parent: null },
];

function issue(identifier, state, extra = {}) {
  return {
    identifier,
    title: `Title ${identifier}`,
    url: `https://linear.app/kc/issue/${identifier}`,
    description: extra.description ?? null,
    state: { name: state },
    project: extra.project ? { name: extra.project } : null,
    projectMilestone: extra.milestone ? { name: extra.milestone } : null,
    labels: { nodes: (extra.labels ?? []).map((name) => ({ name })) },
    inverseRelations: {
      nodes: (extra.blockers ?? []).map(([id, blockerState]) => ({
        type: "blocks",
        issue: { identifier: id, state: { name: blockerState } },
      })),
    },
  };
}

/** Applies the `and` clauses that `listIssues` sends, the way Linear would. */
function matches(node, clause) {
  if (clause.state) return clause.state.name.in.includes(node.state.name);
  if (clause.project) {
    return node.project?.name.toLowerCase() === clause.project.name.eqIgnoreCase.toLowerCase();
  }
  if (clause.projectMilestone) {
    return (
      node.projectMilestone?.name.toLowerCase() ===
      clause.projectMilestone.name.eqIgnoreCase.toLowerCase()
    );
  }
  if (clause.labels?.some) {
    return node.labels.nodes.some((label) => label.name === clause.labels.some.name.eq);
  }
  if (clause.labels?.every) {
    return node.labels.nodes.every((label) => label.name !== clause.labels.every.name.neq);
  }
  return true;
}

/** A fake GraphQL transport over an in-memory team. */
function fakeLinear(issues = [], { labelPageSize = 100 } = {}) {
  const calls = [];
  const created = [];
  const comments = [];
  async function gql(query, variables = {}) {
    calls.push({ query, variables });
    if (query.includes("teams(filter")) {
      return { teams: { nodes: [{ id: "team-1" }] } };
    }
    if (query.includes("workflowStates(")) {
      assert.equal(variables.id, "team-1");
      return { workflowStates: { nodes: STATES } };
    }
    if (query.includes("issueLabels(")) {
      const start = variables.after ? Number(variables.after) : 0;
      const page = LABELS.slice(start, start + labelPageSize);
      const next = start + labelPageSize;
      return {
        issueLabels: {
          nodes: page,
          pageInfo: { hasNextPage: next < LABELS.length, endCursor: String(next) },
        },
      };
    }
    if (query.includes("issues(filter")) {
      const pageSize = variables.first;
      const hits = issues.filter((node) => variables.filter.and.every((c) => matches(node, c)));
      const start = variables.after ? Number(variables.after) : 0;
      const page = hits.slice(start, start + pageSize);
      const next = start + pageSize;
      return {
        issues: {
          nodes: page,
          pageInfo: { hasNextPage: next < hits.length, endCursor: String(next) },
        },
      };
    }
    if (query.includes("projects(filter")) {
      return {
        projects: {
          nodes:
            variables.name === "Gallery"
              ? [
                  {
                    id: "p-1",
                    projectMilestones: {
                      nodes: [
                        { id: "m-1", name: "Alpha" },
                        { id: "m-2", name: "Beta" },
                      ],
                    },
                  },
                ]
              : [],
        },
      };
    }
    if (query.includes("commentCreate")) {
      comments.push(variables.input);
      return { commentCreate: { comment: { id: "c-1", url: "https://linear.app/x/c-1" } } };
    }
    if (query.includes("issueCreate")) {
      created.push(variables.input);
      return {
        issueCreate: { issue: { identifier: "KIT-900", url: "https://linear.app/x/KIT-900" } },
      };
    }
    throw new Error(`unexpected query: ${query}`);
  }
  return { gql, calls, created, comments };
}

const names = (items) => items.map((item) => item.identifier);

test("list filters by state and label, and resolves names case-insensitively", async () => {
  const { gql } = fakeLinear([
    issue("KIT-1", "To-do", { labels: ["ready-for-agent"] }),
    issue("KIT-2", "To-do", { labels: ["needs-info"] }),
    issue("KIT-3", "Backlog", { labels: ["ready-for-agent"] }),
    issue("KIT-4", "In Progress", { labels: ["ready-for-agent"] }),
  ]);
  assert.deepEqual(
    names(await listIssues(gql, ["--state", "to-do", "--label", "ready-for-agent"])),
    ["KIT-1"],
  );
  assert.deepEqual(names(await listIssues(gql, ["--state", "To-do,Backlog"])), [
    "KIT-1",
    "KIT-2",
    "KIT-3",
  ]);
});

test("list --no-label and --project narrow the result", async () => {
  const { gql } = fakeLinear([
    issue("KIT-1", "To-do", { labels: ["bug"], project: "Gallery" }),
    issue("KIT-2", "To-do", { project: "Gallery" }),
    issue("KIT-3", "To-do", { project: "Other" }),
  ]);
  assert.deepEqual(names(await listIssues(gql, ["--no-label", "bug"])), ["KIT-2", "KIT-3"]);
  assert.deepEqual(names(await listIssues(gql, ["--project", "gallery", "--no-label", "bug"])), [
    "KIT-2",
  ]);
});

test("list --unblocked drops open blockers and keeps resolved ones", async () => {
  const { gql } = fakeLinear([
    issue("KIT-1", "To-do"),
    issue("KIT-2", "To-do", { blockers: [["KIT-1", "To-do"]] }),
    issue("KIT-3", "To-do", {
      blockers: [
        ["KIT-1", "In Progress"],
        ["KIT-9", "Done"],
      ],
    }),
    ...["Done", "Canceled", "Duplicate", "Post-Merge"].map((state, index) =>
      issue(`KIT-1${index}`, "To-do", { blockers: [["KIT-8", state]] }),
    ),
  ]);
  const all = await listIssues(gql, []);
  assert.deepEqual(all.find((item) => item.identifier === "KIT-3").blockedBy, ["KIT-1"]);
  assert.deepEqual(all.find((item) => item.identifier === "KIT-10").blockedBy, []);
  assert.deepEqual(names(await listIssues(gql, ["--unblocked"])), [
    "KIT-1",
    "KIT-10",
    "KIT-11",
    "KIT-12",
    "KIT-13",
  ]);
});

test("list parses write-scope, including markdown-escaped globs, or gives null", async () => {
  const { gql } = fakeLinear([
    issue("KIT-1", "To-do", {
      description: "intro\nwrite-scope: scripts/\\*\\*, docs/agents/\\*.md\n",
    }),
    issue("KIT-2", "To-do", { description: "no scope here" }),
    issue("KIT-3", "To-do"),
  ]);
  const [one, two, three] = await listIssues(gql, []);
  assert.deepEqual(one.writeScope, ["scripts/**", "docs/agents/*.md"]);
  assert.equal(two.writeScope, null);
  assert.equal(three.writeScope, null);
  assert.deepEqual(Object.keys(one), [
    "identifier",
    "title",
    "state",
    "labels",
    "blockedBy",
    "writeScope",
    "scenarioFailure",
    "project",
    "milestone",
    "url",
  ]);
});

test("list paginates internally and honours the limit", async () => {
  const many = Array.from({ length: 230 }, (_, index) => issue(`KIT-${index + 1}`, "To-do"));
  const { gql, calls } = fakeLinear(many);
  assert.equal((await listIssues(gql, ["--limit", "250"])).length, 230);
  assert.equal((await listIssues(gql, [])).length, 50);
  assert.equal((await listIssues(gql, ["--limit", "5000"])).length, 230);
  assert.ok(calls.filter((call) => call.query.includes("issues(filter")).length >= 3);
});

test("list refuses an unknown state or label and names the valid ones", async () => {
  const { gql } = fakeLinear([]);
  await assert.rejects(listIssues(gql, ["--state", "Nope"]), (error) => {
    assert.ok(error instanceof LinearUsageError);
    assert.match(error.message, /no state "Nope"; valid: Backlog, To-do/);
    return true;
  });
  await assert.rejects(
    listIssues(gql, ["--label", "nope"]),
    /no label "nope"; valid: ready-for-agent/,
  );
  await assert.rejects(listIssues(gql, ["--limit", "0"]), /--limit/);
});

const GOOD_BODY =
  "## What to build\nx\n\nwrite-scope: scripts/**\n\n## Acceptance criteria\n- [ ] it works\n";

function parse(args, body = GOOD_BODY) {
  return parseCreateArgs(args, (path) => (path === "missing.md" ? null : body));
}

async function create(args, { body, issues } = {}) {
  const fake = fakeLinear(issues);
  const blocks = [];
  const created = await createIssue(fake.gql, parse(args, body), {
    loadIssueId: async (id) => `uuid-${id}`,
    block: async (blocked, blocker) => blocks.push([blocked, blocker]),
  });
  return { created, input: fake.created[0], blocks };
}

test("create makes a Backlog issue on the team by default and prints its identifier", async () => {
  const { created, input } = await create(["My title", "--body-file", "b.md"]);
  assert.equal(created.identifier, "KIT-900");
  assert.equal(input.teamId, "team-1");
  assert.equal(input.stateId, "s-backlog");
  assert.equal(input.title, "My title");
  assert.equal(input.description, GOOD_BODY);
  assert.deepEqual(input.labelIds, []);
});

test("create passes state, labels, project and parent through", async () => {
  const { input } = await create([
    "T",
    "--body-file",
    "b.md",
    "--state",
    "To-do",
    "--label",
    "ready-for-agent",
    "--label",
    "bug",
    "--project",
    "Gallery",
    "--parent",
    "kit-5",
  ]);
  assert.equal(input.stateId, "s-todo");
  assert.deepEqual(input.labelIds, ["l-ready", "l-bug"]);
  assert.equal(input.projectId, "p-1");
  assert.equal(input.parentId, "uuid-KIT-5");
});

test("create --blocked-by creates the blocking relation like block does", async () => {
  const { blocks } = await create([
    "T",
    "--body-file",
    "b.md",
    "--blocked-by",
    "KIT-3",
    "--blocked-by",
    "kit-4",
  ]);
  assert.deepEqual(blocks, [
    ["KIT-900", "KIT-3"],
    ["KIT-900", "KIT-4"],
  ]);
});

test("create refuses signal-up and proposal", async () => {
  for (const label of ["signal-up", "proposal"]) {
    await assert.rejects(
      create(["T", "--body-file", "b.md", "--label", label]),
      new RegExp(`label "${label}" is refused`),
    );
  }
});

test("create refuses ready-for-agent without scope, without acceptance criteria, or in another state", async () => {
  const args = ["T", "--body-file", "b.md", "--label", "ready-for-agent"];
  await assert.rejects(create(args, { body: "## Acceptance criteria\n- [ ] a\n" }), /write-scope/);
  await assert.rejects(
    create(args, { body: "write-scope: \n## Acceptance criteria\n- [ ] a\n" }),
    /write-scope/,
  );
  await assert.rejects(create(args, { body: "write-scope: a/**\n" }), /Acceptance criteria/);
  await assert.rejects(
    create(args, { body: "write-scope: a/**\n## Acceptance criteria\nnothing\n- [x] done\n" }),
    /Acceptance criteria/,
  );
  await assert.rejects(create([...args, "--state", "In Progress"]), /needs state To-do or Backlog/);
  await create([...args, "--state", "To-do"]);
});

test("create refuses two labels from the same exclusive group, naming both", async () => {
  await assert.rejects(
    create(["T", "--body-file", "b.md", "--label", "ready-for-agent", "--label", "needs-info"]),
    /"ready-for-agent" and "needs-info" are in the same exclusive group "Triage"/,
  );
});

test("create refuses a missing or empty body file and a missing title", async () => {
  assert.throws(() => parse(["T", "--body-file", "missing.md"]), /does not exist/);
  assert.throws(() => parse(["T", "--body-file", "b.md"], "  \n"), /is empty/);
  assert.throws(() => parse(["T"]), /--body-file/);
  assert.throws(() => parse(["--body-file", "b.md"]), /create "<title>"/);
  assert.throws(() => parse(["T", "--body-file", "b.md", "--blocked-by", "3"]), /KIT-12/);
});

test("create refuses an unknown label, state or project before creating anything", async () => {
  for (const [extra, pattern] of [
    [["--label", "nope"], /no label "nope"/],
    [["--state", "Nope"], /no state "Nope"/],
    [["--project", "Missing"], /no project "Missing"/],
  ]) {
    const fake = fakeLinear();
    await assert.rejects(
      createIssue(fake.gql, parse(["T", "--body-file", "b.md", ...extra]), {
        loadIssueId: async () => "x",
        block: async () => {},
      }),
      pattern,
    );
    assert.equal(fake.created.length, 0);
  }
});

test("labels are loaded page by page, so labels past the first page still resolve", async () => {
  const fake = fakeLinear([issue("KIT-1", "To-do", { labels: ["bug"] })], { labelPageSize: 2 });
  assert.deepEqual(names(await listIssues(fake.gql, ["--label", "bug"])), ["KIT-1"]);
  assert.equal(fake.calls.filter((call) => call.query.includes("issueLabels(")).length, 3);
});

test("list --milestone filters on the project milestone and the record names it", async () => {
  const { gql, calls } = fakeLinear([
    issue("KIT-1", "Done", { project: "Holdout Scenarios", milestone: "Fixture" }),
    issue("KIT-2", "Canceled", { project: "Holdout Scenarios", milestone: "Holdout" }),
    issue("KIT-3", "Done", { project: "Holdout Scenarios" }),
  ]);
  const items = await listIssues(gql, ["--project", "Holdout Scenarios", "--milestone", "fixture"]);
  assert.deepEqual(names(items), ["KIT-1"]);
  assert.equal(items[0].milestone, "Fixture");
  const sent = calls.find((c) => c.query.includes("issues(filter")).variables.filter.and;
  assert.deepEqual(
    sent.find((c) => c.projectMilestone),
    { projectMilestone: { name: { eqIgnoreCase: "fixture" } } },
  );
  const all = await listIssues(gql, []);
  assert.equal(all.find((i) => i.identifier === "KIT-3").milestone, null);
});

// ---- KIT-354: create --milestone, project-comment, the failure-issue marker -------------------------

test("create --milestone resolves the project's milestone case-insensitively and sends its id", async () => {
  const { input } = await create([
    "T",
    "--body-file",
    "b.md",
    "--project",
    "Gallery",
    "--milestone",
    "beta",
  ]);
  assert.equal(input.projectId, "p-1");
  assert.equal(input.projectMilestoneId, "m-2");
  const plain = await create(["T", "--body-file", "b.md", "--project", "Gallery"]);
  assert.ok(!("projectMilestoneId" in plain.input));
});

test("create --milestone needs --project, and an unknown milestone names the valid ones before anything is created", async () => {
  assert.throws(
    () => parse(["T", "--body-file", "b.md", "--milestone", "Alpha"]),
    (error) =>
      error instanceof LinearUsageError && /--milestone needs --project/.test(error.message),
  );
  const fake = fakeLinear();
  await assert.rejects(
    createIssue(
      fake.gql,
      parse(["T", "--body-file", "b.md", "--project", "Gallery", "--milestone", "Gamma"]),
      {
        loadIssueId: async (id) => id,
        block: async () => {},
      },
    ),
    /no milestone "Gamma" in project Gallery; valid: Alpha, Beta/,
  );
  assert.equal(fake.created.length, 0);
});

test("project-comment parses a project and a body file, and refuses an empty or missing one", () => {
  const read = (path) => (path === "missing.md" ? null : path === "empty.md" ? "  \n" : "hello");
  assert.deepEqual(parseProjectCommentArgs(["Gallery", "--body-file", "b.md"], read), {
    project: "Gallery",
    body: "hello",
  });
  for (const argv of [
    [],
    ["--body-file", "b.md"],
    ["Gallery"],
    ["Gallery", "--body-file", "missing.md"],
    ["Gallery", "--body-file", "empty.md"],
  ]) {
    assert.throws(
      () => parseProjectCommentArgs(argv, read),
      LinearUsageError,
      JSON.stringify(argv),
    );
  }
});

test("project-comment writes a comment on the project (commentCreate projectId), nothing else", async () => {
  const fake = fakeLinear();
  const made = await createProjectComment(fake.gql, {
    project: "Gallery",
    body: "Satisfaction 4/6",
  });
  assert.deepEqual(fake.comments, [{ projectId: "p-1", body: "Satisfaction 4/6" }]);
  assert.deepEqual(made, { id: "c-1", url: "https://linear.app/x/c-1" });
  await assert.rejects(
    createProjectComment(fake.gql, { project: "Nope", body: "x" }),
    /no project "Nope"/,
  );
  assert.equal(fake.comments.length, 1);
});

test("list marks an issue whose description carries the Milestone scenarios footer line, and only then", async () => {
  const { gql } = fakeLinear([
    issue("KIT-1", "To-do", { description: `## x\n\n${SCENARIO_FAILURE_FOOTER}\n` }),
    issue("KIT-2", "To-do", {
      description: `Scenario not met: x. ${SCENARIO_FAILURE_FOOTER} but inline`,
    }),
    issue("KIT-3", "To-do", { description: null }),
  ]);
  const items = await listIssues(gql, []);
  assert.deepEqual(
    items.map((i) => [i.identifier, i.scenarioFailure]),
    [
      ["KIT-1", true],
      ["KIT-2", false],
      ["KIT-3", false],
    ],
  );
});

const WORKPAD = [
  "## Agent Workpad",
  "",
  "```text",
  "development:bb/kit-9@abc1234",
  "```",
  "",
  "### Waiting",
  "",
  "- (none)",
  "",
  "### Plan",
  "",
  "- [ ] 1. Parent",
  "",
  "### Notes",
  "",
  "- first line",
  "- second line",
  "",
].join("\n");

test("replaceWorkpadSection replaces only the named section and leaves every other byte", () => {
  const next = replaceWorkpadSection(WORKPAD, "Waiting", [
    "- ask",
    "- Stage: gate. Asked: 2026-10-17",
  ]);
  assert.equal(next, WORKPAD.replace("- (none)", "- ask\n- Stage: gate. Asked: 2026-10-17"));
  const last = replaceWorkpadSection(WORKPAD, "Notes", ["- only"]);
  assert.equal(last, WORKPAD.replace("- first line\n- second line", "- only"));
  assert.equal(replaceWorkpadSection(WORKPAD, "Evidence", ["x"]), null);
  assert.equal(
    replaceWorkpadSection("## Agent Workpad\n### Waitingness\n- a\n", "Waiting", ["x"]),
    null,
  );
});

test("waiting parses an issue key, --stage and --ask, and refuses a missing or empty one", () => {
  assert.deepEqual(parseWaitingArgs(["kit-9", "--stage", "pre-review gate", "--ask", "run it"]), {
    issue: "KIT-9",
    stage: "pre-review gate",
    ask: "run it",
  });
  for (const argv of [
    [],
    ["--stage", "s", "--ask", "a"],
    ["KIT-9", "--ask", "a"],
    ["KIT-9", "--stage", "s"],
    ["KIT-9", "--stage", "--ask", "a"],
    ["KIT-9", "--stage", "s", "--ask", "  "],
    ["KIT-9", "--stage", "s", "--ask", "two\nlines"],
  ]) {
    assert.throws(() => parseWaitingArgs(argv), LinearUsageError, JSON.stringify(argv));
  }
});

function fakeWorkpadIssue(comments) {
  const updates = [];
  async function gql(query, variables = {}) {
    if (query.includes("commentUpdate")) {
      updates.push({ id: variables.id, body: variables.input.body });
      return { commentUpdate: { success: true } };
    }
    if (query.includes("comments(")) {
      assert.equal(variables.id, "KIT-9");
      return { issue: { comments: { nodes: comments } } };
    }
    if (query.includes("commentCreate")) {
      throw new Error("waiting must never create a comment");
    }
    throw new Error(`unexpected query: ${query}`);
  }
  return { gql, updates };
}

test("waiting updates the one workpad comment, its Waiting section only", async () => {
  const fake = fakeWorkpadIssue([
    { id: "c-note", body: "Max: claimed." },
    { id: "c-pad", body: WORKPAD },
  ]);
  const id = await fillWaiting(fake.gql, {
    issue: "KIT-9",
    stage: "pre-review gate",
    ask: "needs-human: run device-run.sh on the Mac on abc1234",
    date: "2026-10-17",
  });
  assert.equal(id, "c-pad");
  assert.deepEqual(fake.updates, [
    {
      id: "c-pad",
      body: WORKPAD.replace(
        "- (none)",
        "- needs-human: run device-run.sh on the Mac on abc1234\n- Stage: pre-review gate. Asked: 2026-10-17",
      ),
    },
  ]);
});

test("waiting refuses zero or two workpads and a workpad without ### Waiting, and writes nothing", async () => {
  const cases = [
    [[{ id: "c-1", body: "Max: claimed." }], /no workpad/],
    [
      [
        { id: "c-1", body: WORKPAD },
        { id: "c-2", body: WORKPAD },
      ],
      /2 workpad/,
    ],
    [[{ id: "c-1", body: "## Agent Workpad\n\n### Plan\n\n- x\n" }], /no ### Waiting/],
  ];
  for (const [comments, message] of cases) {
    const fake = fakeWorkpadIssue(comments);
    await assert.rejects(
      fillWaiting(fake.gql, { issue: "KIT-9", stage: "s", ask: "a", date: "2026-10-17" }),
      message,
    );
    assert.equal(fake.updates.length, 0);
  }
});

// ---- review-matrix: the workflow moves the Reviewer's file into the workpad (KIT-404) -------------

const HEAD = "b".repeat(40);
const matrixFile = (at = HEAD.slice(0, 12), extra = "") =>
  [
    "### Review matrix",
    "",
    "| row | status | evidence | at |",
    "| --- | --- | --- | --- |",
    ...LOCK_ROWS.map((lock) => `| ${lock.id} | checked | read it twice | ${at} |`),
    "",
    extra,
  ].join("\n");

test("review-matrix parses an issue key and a full head sha only", () => {
  assert.deepEqual(parseReviewMatrixArgs(["kit-9", "--head", HEAD.toUpperCase()]), {
    issue: "KIT-9",
    head: HEAD,
  });
  for (const argv of [[], ["KIT-9"], ["KIT-9", "--head", "abc1234"], ["x", "--head", HEAD]]) {
    assert.throws(() => parseReviewMatrixArgs(argv), LinearUsageError, JSON.stringify(argv));
  }
});

test("sectionLines keeps a section's lines verbatim and ends it at the next heading", () => {
  const text = "# t\n### Review matrix\n\n| a |\n  odd  \n\n### Review feedback\n- f\n";
  assert.deepEqual(sectionLines(text, "Review matrix"), ["| a |", "  odd  "]);
  assert.deepEqual(sectionLines(text, "Review feedback"), ["- f"]);
  assert.equal(sectionLines(text, "Plan"), null);
});

test("a matrix that is incomplete, read at another head, or in another checkout is refused", () => {
  const heads = { head: HEAD, checkoutHead: HEAD };
  assert.equal(reviewMatrixProblem(matrixFile(), heads), null);
  assert.equal(reviewMatrixProblem(matrixFile(HEAD), heads), null);
  assert.match(
    reviewMatrixProblem("no matrix here", heads),
    /^matrix-invalid: .*no ### Review matrix/,
  );
  assert.match(
    reviewMatrixProblem(matrixFile().replace(/\| spec-ac .*\n/, ""), heads),
    /^matrix-invalid: row `spec-ac` is missing/,
  );
  assert.match(
    reviewMatrixProblem(matrixFile("c".repeat(12)), heads),
    /^matrix-invalid: row `spec-ac` was read at "c{12}"/,
  );
  assert.match(
    reviewMatrixProblem(matrixFile(""), heads),
    /^matrix-invalid: row `spec-ac` was read at ""/,
  );
  assert.match(
    reviewMatrixProblem(matrixFile(), { head: HEAD, checkoutHead: "d".repeat(40) }),
    /^matrix-invalid: this checkout is at d{12}/,
  );
});

test("review-matrix replaces the workpad's matrix and adds feedback, verbatim, touching nothing else", async () => {
  const old = `${WORKPAD}\n### Review matrix\n\n| spec-ac | finding | old | aaaaaaa |\n`;
  const fake = fakeWorkpadIssue([
    { id: "c-note", body: "Max: claimed." },
    { id: "c-pad", body: old },
  ]);
  const text = matrixFile(
    HEAD.slice(0, 12),
    "### Review feedback\n\n- Spec: AC 2 (nit) `x` \\| y\n",
  );
  const id = await fillReviewMatrix(fake.gql, {
    issue: "KIT-9",
    text,
    head: HEAD,
    checkoutHead: HEAD,
  });
  assert.equal(id, "c-pad");
  assert.equal(fake.updates.length, 1);
  const body = fake.updates[0].body;
  assert.ok(body.startsWith(WORKPAD), "the sections before the matrix are untouched");
  assert.equal(
    sectionLines(body, "Review matrix").join("\n"),
    sectionLines(text, "Review matrix").join("\n"),
  );
  assert.deepEqual(sectionLines(body, "Review feedback"), ["- Spec: AC 2 (nit) `x` \\| y"]);
  assert.doesNotMatch(body, /\| old \|/);
});

test("review-matrix writes nothing for a refused file, or a workpad that is not exactly one", async () => {
  const refused = fakeWorkpadIssue([{ id: "c-pad", body: WORKPAD }]);
  await assert.rejects(
    fillReviewMatrix(refused.gql, {
      issue: "KIT-9",
      text: matrixFile("c".repeat(7)),
      head: HEAD,
      checkoutHead: HEAD,
    }),
    /matrix-invalid/,
  );
  assert.equal(refused.updates.length, 0);
  const none = fakeWorkpadIssue([{ id: "c-1", body: "Max: claimed." }]);
  await assert.rejects(
    fillReviewMatrix(none.gql, {
      issue: "KIT-9",
      text: matrixFile(),
      head: HEAD,
      checkoutHead: HEAD,
    }),
    /no workpad/,
  );
  assert.equal(none.updates.length, 0);
});
