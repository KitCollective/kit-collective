#!/usr/bin/env node
/**
 * Idempotent Linear workspace bootstrap for Kit Collective.
 *
 * Official Linear MCP cannot create teams or workflow states. This script
 * uses GraphQL with an admin API key. Runtime agents must keep using MCP.
 *
 * Usage:
 *   LINEAR_API_KEY=lin_api_... node scripts/bootstrap-linear.mjs
 *   LINEAR_API_KEY=... node scripts/bootstrap-linear.mjs --dry-run
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SETUP_PATH = join(ROOT, "linear.setup.json");
const EXAMPLE_PATH = join(ROOT, "linear.setup.example.json");
const GRAPHQL_URL =
  process.env.LINEAR_GRAPHQL_URL ?? "https://api.linear.app/graphql";
const DRY_RUN = process.argv.includes("--dry-run");

const TEAM = { key: "KIT", name: "Kit Collective" };
const EXPECTED_WORKSPACE = /kit\s*collective/i;
const ALLOW_ANY_WORKSPACE = process.argv.includes("--allow-any-workspace");

/** @type {{ name: string, type: "backlog" | "unstarted" | "started" | "completed" | "canceled", color: string }[]} */
const STATES = [
  { name: "Backlog", type: "backlog", color: "#bec2c8" },
  { name: "Parked", type: "unstarted", color: "#95a2b3" },
  { name: "Implementing", type: "started", color: "#f2c94c" },
  { name: "In Review", type: "started", color: "#5e6ad2" },
  { name: "Ready for merge", type: "started", color: "#26b5ce" },
  { name: "Rework", type: "started", color: "#eb5757" },
  { name: "Done", type: "completed", color: "#4cb782" },
  { name: "Canceled", type: "canceled", color: "#95a2b3" },
];

/** @type {{ name: string, color: string, description: string }[]} */
const LABELS = [
  { name: "signal-up", color: "#f2994a", description: "Out-of-scope finding. Human triage only." },
  { name: "needs-triage", color: "#eb5757", description: "Waiting for a human before dispatch." },
  { name: "ready-for-agent", color: "#5e6ad2", description: "Spec/ticket is well-formed. Dispatch still requires delegate." },
  { name: "ready-for-human", color: "#26b5ce", description: "Blocked on a human decision." },
  { name: "wontfix", color: "#95a2b3", description: "Will not be done." },
  { name: "kickoff", color: "#9b51e0", description: "New Linear project from /to-spec kickoff." },
  { name: "feature", color: "#27ae60", description: "Feature spec against an existing project." },
  { name: "surface:mobile", color: "#2f80ed", description: "Touches apps/mobile." },
  { name: "surface:web", color: "#27ae60", description: "Touches apps/web." },
  { name: "surface:admin", color: "#bb6bd9", description: "Touches apps/admin." },
  { name: "surface:api", color: "#f2c94c", description: "Touches apps/api." },
  { name: "seed", color: "#56ccf2", description: "Seed repo / stamdata work." },
];

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
  console.error("Missing LINEAR_API_KEY. See .env.example.");
  process.exit(1);
}

/**
 * @param {string} query
 * @param {Record<string, unknown>} [variables]
 */
async function graphql(query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    const detail = JSON.stringify(payload.errors ?? payload, null, 2);
    throw new Error(`Linear GraphQL failed: ${detail}`);
  }
  return payload.data;
}

function log(message) {
  console.log(`${DRY_RUN ? "[dry-run] " : ""}${message}`);
}

async function assertWorkspace() {
  const data = await graphql(`
    query Workspace {
      organization {
        name
        urlKey
      }
    }
  `);
  const name = data.organization?.name ?? "";
  const urlKey = data.organization?.urlKey ?? "";
  log(`Connected workspace: ${name} (${urlKey}).`);
  if (ALLOW_ANY_WORKSPACE) {
    return;
  }
  if (!EXPECTED_WORKSPACE.test(name) && !EXPECTED_WORKSPACE.test(urlKey)) {
    throw new Error(
      `Refusing to bootstrap workspace "${name}". Connect Linear to Kit Collective, or pass --allow-any-workspace.`,
    );
  }
}

async function ensureTeam() {
  const data = await graphql(`
    query Teams {
      teams(first: 50) {
        nodes { id key name }
      }
    }
  `);
  const existing = data.teams.nodes.find((team) => team.key === TEAM.key);
  if (existing) {
    log(`Team ${TEAM.key} exists (${existing.id}).`);
    return existing;
  }
  if (DRY_RUN) {
    log(`Would create team ${TEAM.key}.`);
    return { id: "dry-run", key: TEAM.key, name: TEAM.name };
  }
  const created = await graphql(
    `
      mutation CreateTeam($input: TeamCreateInput!) {
        teamCreate(input: $input) {
          success
          team { id key name }
        }
      }
    `,
    { input: { key: TEAM.key, name: TEAM.name } },
  );
  if (!created.teamCreate.success || !created.teamCreate.team) {
    throw new Error("teamCreate did not return a team.");
  }
  log(`Created team ${TEAM.key} (${created.teamCreate.team.id}).`);
  return created.teamCreate.team;
}

/**
 * @param {{ id: string }} team
 */
async function listStates(team) {
  const data = await graphql(
    `
      query TeamStates($id: String!) {
        team(id: $id) {
          states {
            nodes { id name type position }
          }
        }
      }
    `,
    { id: team.id },
  );
  return data.team.states.nodes;
}

/**
 * Map Linear's default names onto our contract, then create anything missing.
 * @param {{ id: string }} team
 */
async function ensureStates(team) {
  if (team.id === "dry-run") {
    return Object.fromEntries(
      STATES.map((state) => [state.name, { id: "dry-run", type: state.type }]),
    );
  }

  const current = await listStates(team);
  /** @type {Record<string, { id: string, type: string }>} */
  const byName = {};

  const defaultRename = {
    Todo: "Parked",
    "In Progress": "Implementing",
    Cancelled: "Canceled",
    Duplicate: null,
  };

  for (const state of current) {
    const mapped = defaultRename[state.name];
    if (mapped === null) {
      continue;
    }
    const targetName = mapped ?? state.name;
    const wanted = STATES.find((item) => item.name === targetName);
    if (wanted && state.name !== wanted.name) {
      if (!DRY_RUN) {
        await graphql(
          `
            mutation RenameState($id: String!, $input: WorkflowStateUpdateInput!) {
              workflowStateUpdate(id: $id, input: $input) {
                success
              }
            }
          `,
          { id: state.id, input: { name: wanted.name, color: wanted.color } },
        );
      }
      log(`Renamed state "${state.name}" → "${wanted.name}".`);
      byName[wanted.name] = { id: state.id, type: wanted.type };
    } else if (wanted) {
      byName[wanted.name] = { id: state.id, type: wanted.type };
    }
  }

  const refreshed = await listStates(team);
  for (const wanted of STATES) {
    const found =
      byName[wanted.name] ??
      refreshed.find((state) => state.name === wanted.name);
    if (found) {
      byName[wanted.name] = {
        id: found.id,
        type: wanted.type,
      };
      continue;
    }
    if (DRY_RUN) {
      log(`Would create state "${wanted.name}" (${wanted.type}).`);
      byName[wanted.name] = { id: "dry-run", type: wanted.type };
      continue;
    }
    const created = await graphql(
      `
        mutation CreateState($input: WorkflowStateCreateInput!) {
          workflowStateCreate(input: $input) {
            success
            workflowState { id name type }
          }
        }
      `,
      {
        input: {
          teamId: team.id,
          name: wanted.name,
          type: wanted.type,
          color: wanted.color,
        },
      },
    );
    const node = created.workflowStateCreate.workflowState;
    if (!created.workflowStateCreate.success || !node) {
      throw new Error(`Failed to create state ${wanted.name}.`);
    }
    log(`Created state "${wanted.name}".`);
    byName[wanted.name] = { id: node.id, type: wanted.type };
  }

  return byName;
}

/**
 * @param {{ id: string }} team
 */
async function ensureLabels(team) {
  const data = await graphql(`
    query Labels {
      issueLabels(first: 250) {
        nodes { id name team { id } }
      }
    }
  `);
  const existing = new Map(
    (data.issueLabels?.nodes ?? [])
      .filter((label) => !label.team || label.team.id === team.id)
      .map((label) => [label.name, label.id]),
  );
  /** @type {Record<string, string>} */
  const ids = {};

  for (const label of LABELS) {
    const found = existing.get(label.name);
    if (found) {
      ids[label.name] = found;
      log(`Label "${label.name}" exists.`);
      continue;
    }
    if (DRY_RUN || team.id === "dry-run") {
      log(`Would create label "${label.name}".`);
      ids[label.name] = "dry-run";
      continue;
    }
    const created = await graphql(
      `
        mutation CreateLabel($input: IssueLabelCreateInput!) {
          issueLabelCreate(input: $input) {
            success
            issueLabel { id name }
          }
        }
      `,
      {
        input: {
          teamId: team.id,
          name: label.name,
          color: label.color,
          description: label.description,
        },
      },
    );
    const node = created.issueLabelCreate.issueLabel;
    if (!created.issueLabelCreate.success || !node) {
      throw new Error(`Failed to create label ${label.name}.`);
    }
    log(`Created label "${label.name}".`);
    ids[label.name] = node.id;
  }

  return ids;
}

function writeSetup(team, states, labels) {
  const example = JSON.parse(readFileSync(EXAMPLE_PATH, "utf8"));
  const setup = {
    ...example,
    workspaceName: "Kit Collective",
    team: { key: team.key, name: team.name, id: team.id },
    states: Object.fromEntries(
      STATES.map((state) => [
        state.name,
        { id: states[state.name].id, type: state.type },
      ]),
    ),
    labels,
    delegateAgentName: "Cursor",
    bootstrappedAt: new Date().toISOString(),
  };
  if (DRY_RUN) {
    log(`Would write ${SETUP_PATH}`);
    console.log(JSON.stringify(setup, null, 2));
    return;
  }
  writeFileSync(SETUP_PATH, `${JSON.stringify(setup, null, 2)}\n`);
  log(`Wrote ${SETUP_PATH}`);
}

await assertWorkspace();
const team = await ensureTeam();
const states = await ensureStates(team);
const labels = await ensureLabels(team);
writeSetup(team, states, labels);
log("Bootstrap complete. Re-run is safe (idempotent).");
