#!/usr/bin/env node
// Linear access for agent sessions that have no KitCollective Linear MCP
// (Claude Code Desktop, issue worktrees). Reads LINEAR_API_KEY from the
// environment, or from the main checkout's gitignored .env, and never prints it.
//
//   node scripts/linear.mjs workspace
//   node scripts/linear.mjs issue KIT-272
//   node scripts/linear.mjs comment KIT-272 --body-file <path>
//   node scripts/linear.mjs comment-update <commentId> --body-file <path>
//   node scripts/linear.mjs state KIT-272 "Implementing"
//   node scripts/linear.mjs label KIT-272 add|remove <label>
//   node scripts/linear.mjs description KIT-272 --body-file <path>
//   node scripts/linear.mjs link KIT-272 <url> [title]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const API = "https://api.linear.app/graphql";

function fail(message) {
  process.stderr.write(`linear: ${message}\n`);
  process.exit(1);
}

function mainCheckoutRoot() {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8",
  }).trim();
  return dirname(common);
}

function apiKey() {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  const envPath = join(mainCheckoutRoot(), ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const match = /^\s*(?:export\s+)?LINEAR_API_KEY\s*=\s*(.*)\s*$/.exec(line);
      if (match) return match[1].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return fail("LINEAR_API_KEY is not set and not in the main checkout's .env");
}

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: "POST",
    headers: { Authorization: apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.errors) {
    const detail = payload?.errors?.map((error) => error.message).join("; ") ?? response.status;
    fail(`request failed: ${detail}`);
  }
  return payload.data;
}

function bodyFromArgs(args) {
  const index = args.indexOf("--body-file");
  if (index === -1 || !args[index + 1]) fail("--body-file <path> is required");
  return readFileSync(args[index + 1], "utf8");
}

// Refuse to read or write when the key belongs to another Linear workspace.
async function assertWorkspace() {
  const expected = findWorkspaceMatch();
  if (!expected) return;
  const { organization } = await gql("{ organization { urlKey name } }");
  if (!organization.urlKey.toLowerCase().includes(expected.toLowerCase())) {
    fail(
      `key is for workspace "${organization.urlKey}", but factory.config.json expects "${expected}"`,
    );
  }
}

function findWorkspaceMatch() {
  const configPath = join(mainCheckoutRoot(), "factory.config.json");
  if (!existsSync(configPath)) return null;
  const match = /"workspaceMatch"\s*:\s*"([^"]+)"/.exec(readFileSync(configPath, "utf8"));
  return match ? match[1] : null;
}

const ISSUE_QUERY = `query($id: String!) {
  issue(id: $id) {
    id identifier title url description
    state { name }
    team { id }
    project { name }
    projectMilestone { name }
    labels { nodes { id name } }
    relations { nodes { type relatedIssue { identifier state { name } } } }
    inverseRelations { nodes { type issue { identifier state { name } } } }
    attachments { nodes { title url } }
    comments(first: 100) { nodes { id createdAt body user { name } } }
  }
}`;

async function loadIssue(identifier) {
  const { issue } = await gql(ISSUE_QUERY, { id: identifier });
  if (!issue) fail(`${identifier} not found in this workspace`);
  return issue;
}

async function showIssue(identifier) {
  const issue = await loadIssue(identifier);
  const blockedBy = issue.inverseRelations.nodes
    .filter((relation) => relation.type === "blocks")
    .map((relation) => ({
      identifier: relation.issue.identifier,
      state: relation.issue.state.name,
    }));
  const blocks = issue.relations.nodes
    .filter((relation) => relation.type === "blocks")
    .map((relation) => ({
      identifier: relation.relatedIssue.identifier,
      state: relation.relatedIssue.state.name,
    }));
  const out = {
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: issue.state.name,
    project: issue.project?.name ?? null,
    milestone: issue.projectMilestone?.name ?? null,
    labels: issue.labels.nodes.map((label) => label.name),
    blockedBy,
    blocks,
    attachments: issue.attachments.nodes,
    description: issue.description,
    comments: issue.comments.nodes
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((comment) => ({
        id: comment.id,
        createdAt: comment.createdAt,
        author: comment.user?.name ?? null,
        body: comment.body,
      })),
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

async function setState(identifier, stateName) {
  const issue = await loadIssue(identifier);
  const { team } = await gql(
    "query($id: String!) { team(id: $id) { states { nodes { id name } } } }",
    {
      id: issue.team.id,
    },
  );
  const state = team.states.nodes.find(
    (node) => node.name.toLowerCase() === stateName.toLowerCase(),
  );
  if (!state)
    fail(`no state "${stateName}"; have: ${team.states.nodes.map((node) => node.name).join(", ")}`);
  await gql(
    "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
    {
      id: issue.id,
      input: { stateId: state.id },
    },
  );
  process.stdout.write(`${issue.identifier}: ${issue.state.name} -> ${state.name}\n`);
}

async function setLabel(identifier, action, labelName) {
  if (action !== "add" && action !== "remove") fail("label needs add or remove");
  const issue = await loadIssue(identifier);
  const { team } = await gql(
    "query($id: String!) { team(id: $id) { labels(first: 250) { nodes { id name } } } }",
    {
      id: issue.team.id,
    },
  );
  const label = team.labels.nodes.find(
    (node) => node.name.toLowerCase() === labelName.toLowerCase(),
  );
  if (!label) fail(`no label "${labelName}" on the team`);
  const current = new Set(issue.labels.nodes.map((node) => node.id));
  if (action === "add") current.add(label.id);
  else current.delete(label.id);
  await gql(
    "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
    {
      id: issue.id,
      input: { labelIds: [...current] },
    },
  );
  process.stdout.write(`${issue.identifier}: ${action} ${label.name}\n`);
}

const [command, ...args] = process.argv.slice(2);

if (command === "workspace") {
  await assertWorkspace();
  const { organization } = await gql("{ organization { urlKey name } }");
  process.stdout.write(`${organization.urlKey} (${organization.name})\n`);
  process.exit(0);
}
await assertWorkspace();

switch (command) {
  case "issue":
    await showIssue(args[0] ?? fail("issue <KIT-n>"));
    break;
  case "comment": {
    const issue = await loadIssue(args[0] ?? fail("comment <KIT-n> --body-file <path>"));
    const { commentCreate } = await gql(
      "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id url } } }",
      { input: { issueId: issue.id, body: bodyFromArgs(args) } },
    );
    process.stdout.write(`${commentCreate.comment.id} ${commentCreate.comment.url}\n`);
    break;
  }
  case "comment-update": {
    const id = args[0] ?? fail("comment-update <commentId> --body-file <path>");
    await gql(
      "mutation($id: String!, $input: CommentUpdateInput!) { commentUpdate(id: $id, input: $input) { success } }",
      {
        id,
        input: { body: bodyFromArgs(args) },
      },
    );
    process.stdout.write(`${id}: updated\n`);
    break;
  }
  case "state":
    await setState(
      args[0] ?? fail("state <KIT-n> <state>"),
      args[1] ?? fail("state <KIT-n> <state>"),
    );
    break;
  case "label":
    await setLabel(
      args[0] ?? fail("label <KIT-n> add|remove <label>"),
      args[1],
      args[2] ?? fail("label name"),
    );
    break;
  case "description": {
    const issue = await loadIssue(args[0] ?? fail("description <KIT-n> --body-file <path>"));
    await gql(
      "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
      {
        id: issue.id,
        input: { description: bodyFromArgs(args) },
      },
    );
    process.stdout.write(`${issue.identifier}: description updated\n`);
    break;
  }
  case "link": {
    const issue = await loadIssue(args[0] ?? fail("link <KIT-n> <url> [title]"));
    const url = args[1] ?? fail("link <KIT-n> <url> [title]");
    await gql(
      "mutation($input: AttachmentCreateInput!) { attachmentCreate(input: $input) { success } }",
      {
        input: { issueId: issue.id, url, title: args[2] ?? url },
      },
    );
    process.stdout.write(`${issue.identifier}: linked ${url}\n`);
    break;
  }
  default:
    fail("commands: workspace, issue, comment, comment-update, state, label, description, link");
}
