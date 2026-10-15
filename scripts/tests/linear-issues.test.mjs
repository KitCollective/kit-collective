import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIssue,
  LinearUsageError,
  listIssues,
  parseCreateArgs,
} from "../lib/linear-issues.mjs";

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
      return { projects: { nodes: variables.name === "Gallery" ? [{ id: "p-1" }] : [] } };
    }
    if (query.includes("issueCreate")) {
      created.push(variables.input);
      return {
        issueCreate: { issue: { identifier: "KIT-900", url: "https://linear.app/x/KIT-900" } },
      };
    }
    throw new Error(`unexpected query: ${query}`);
  }
  return { gql, calls, created };
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
    "project",
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
