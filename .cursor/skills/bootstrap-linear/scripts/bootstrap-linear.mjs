#!/usr/bin/env node
/**
 * Idempotent Linear bootstrap. Reads factory.config.json from the repo root.
 * Official Linear MCP cannot create teams or workflow states — this script can.
 *
 * Usage (from repo root):
 *   LINEAR_API_KEY=lin_api_... node .cursor/skills/bootstrap-linear/scripts/bootstrap-linear.mjs
 *   node scripts/bootstrap-linear.mjs --dry-run
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GRAPHQL_URL =
  process.env.LINEAR_GRAPHQL_URL ?? "https://api.linear.app/graphql";
const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_ANY_WORKSPACE = process.argv.includes("--allow-any-workspace");

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "factory.config.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("factory.config.json not found. Copy factory.config.example.json to the repo root.");
}

const ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(ROOT, "factory.config.json"), "utf8"));
const SETUP_PATH = join(ROOT, config.paths?.setupFile ?? "linear.setup.json");

const TEAM = {
  key: config.linear.teamKey,
  name: config.linear.teamName,
};
const STATES = config.states;
const STATE_ALIASES = config.stateAliases ?? {};
const ISSUE_LABEL_GROUPS = config.labels?.groups ?? [];
const ADOPT_LABELS = config.labels?.adopt ?? [];
const PROJECT_LABEL_GROUPS = config.labels?.projects?.groups ?? [];
const PROJECT_LABELS = config.labels?.projects?.items ?? [];
const SURFACE_LABELS = (config.labels?.surfaces ?? []).map((surface) => ({
  name: `surface:${surface}`,
  color: "#2f80ed",
  description: `Touches the ${surface} surface. Hint for /implement helpers — not a horizontal split.`,
  group: "Surface",
}));
const LABELS = [
  ...(config.labels?.factory ?? []),
  ...SURFACE_LABELS,
  ...(config.labels?.extra ?? []),
];
const WORKSPACE_MATCH = new RegExp(config.product.workspaceMatch, "i");

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
  if (!WORKSPACE_MATCH.test(name) && !WORKSPACE_MATCH.test(urlKey)) {
    throw new Error(
      `Refusing to bootstrap workspace "${name}". Expected match /${config.product.workspaceMatch}/i. Connect Linear to ${config.product.name}, or pass --allow-any-workspace.`,
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

  for (const state of current) {
    const mapped = Object.hasOwn(STATE_ALIASES, state.name)
      ? STATE_ALIASES[state.name]
      : state.name;
    if (mapped === null) {
      continue;
    }
    const wanted = STATES.find((item) => item.name === mapped);
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
      byName[wanted.name] = { id: found.id, type: wanted.type };
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
 * @typedef {{ id: string, name: string, isGroup?: boolean, team?: { id: string } | null, parent?: { id: string, name: string } | null }} LabelNode
 */

/**
 * @param {LabelNode[]} nodes
 */
function indexByName(nodes) {
  return new Map(nodes.map((node) => [node.name.toLowerCase(), node]));
}

async function listIssueLabels() {
  const data = await graphql(`
    query IssueLabels {
      issueLabels(first: 250) {
        nodes {
          id
          name
          isGroup
          team { id }
          parent { id name }
        }
      }
    }
  `);
  return data.issueLabels.nodes;
}

async function listProjectLabels() {
  const data = await graphql(`
    query ProjectLabels {
      projectLabels(first: 250) {
        nodes {
          id
          name
          isGroup
          parent { id name }
        }
      }
    }
  `);
  return data.projectLabels.nodes;
}

/**
 * @param {LabelNode} found
 * @param {{ id: string }} team
 */
async function removeTeamScopedIssueLabel(found, team) {
  if (!found.team) {
    return false;
  }
  if (DRY_RUN || team.id === "dry-run") {
    log(`Would move label "${found.name}" from team to workspace.`);
    return true;
  }
  await graphql(
    `
      mutation DeleteLabel($id: String!) {
        issueLabelDelete(id: $id) {
          success
        }
      }
    `,
    { id: found.id },
  );
  log(`Removed team-scoped label "${found.name}".`);
  return true;
}

/**
 * @param {string} id
 * @param {{ name?: string, color?: string, description?: string, isGroup?: boolean, parentId?: string }} input
 */
async function updateIssueLabel(id, input) {
  await graphql(
    `
      mutation UpdateLabel($id: String!, $input: IssueLabelUpdateInput!) {
        issueLabelUpdate(id: $id, input: $input) {
          success
        }
      }
    `,
    { id, input },
  );
}

/**
 * @param {string} id
 * @param {{ name?: string, color?: string, description?: string, isGroup?: boolean, parentId?: string }} input
 */
async function updateProjectLabel(id, input) {
  await graphql(
    `
      mutation UpdateProjectLabel($id: String!, $input: ProjectLabelUpdateInput!) {
        projectLabelUpdate(id: $id, input: $input) {
          success
        }
      }
    `,
    { id, input },
  );
}

/**
 * @param {{ name: string, color: string, description?: string }} group
 * @param {{ id: string }} team
 */
async function ensureIssueGroup(group, team) {
  const current = indexByName(await listIssueLabels());
  const found = current.get(group.name.toLowerCase());
  if (found && !found.isGroup) {
    throw new Error(
      `Issue label "${found.name}" exists and is not a group. Rename it before bootstrap can create group "${group.name}".`,
    );
  }
  if (found) {
    if (found.team) {
      await removeTeamScopedIssueLabel(found, team);
    } else {
      log(`Issue group "${group.name}" exists.`);
      return found;
    }
  }
  if (DRY_RUN || team.id === "dry-run") {
    log(`Would create issue group "${group.name}".`);
    return { id: "dry-run", name: group.name, isGroup: true };
  }
  const created = await graphql(
    `
      mutation CreateLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel { id name isGroup }
        }
      }
    `,
    {
      input: {
        name: group.name,
        color: group.color,
        description: group.description,
        isGroup: true,
      },
    },
  );
  const node = created.issueLabelCreate.issueLabel;
  if (!created.issueLabelCreate.success || !node) {
    throw new Error(`Failed to create issue group ${group.name}.`);
  }
  log(`Created issue group "${group.name}".`);
  return node;
}

/**
 * @param {{ name: string, color: string, description?: string }} group
 */
async function ensureProjectGroup(group) {
  const current = indexByName(await listProjectLabels());
  const found = current.get(group.name.toLowerCase());
  if (found && !found.isGroup) {
    throw new Error(
      `Project label "${found.name}" exists and is not a group. Rename it before bootstrap can create group "${group.name}".`,
    );
  }
  if (found) {
    log(`Project group "${group.name}" exists.`);
    return found;
  }
  if (DRY_RUN) {
    log(`Would create project group "${group.name}".`);
    return { id: "dry-run", name: group.name, isGroup: true };
  }
  const created = await graphql(
    `
      mutation CreateProjectLabel($input: ProjectLabelCreateInput!) {
        projectLabelCreate(input: $input) {
          success
          projectLabel { id name isGroup }
        }
      }
    `,
    {
      input: {
        name: group.name,
        color: group.color,
        description: group.description,
        isGroup: true,
      },
    },
  );
  const node = created.projectLabelCreate.projectLabel;
  if (!created.projectLabelCreate.success || !node) {
    throw new Error(`Failed to create project group ${group.name}.`);
  }
  log(`Created project group "${group.name}".`);
  return node;
}

/**
 * @param {Record<string, { id: string }>} groupsByName
 * @param {{ name: string, group?: string }} label
 */
function parentIdFor(groupsByName, label) {
  if (!label.group) {
    return undefined;
  }
  const group = groupsByName[label.group];
  if (!group) {
    throw new Error(`Unknown label group "${label.group}" for "${label.name}".`);
  }
  return group.id;
}

/**
 * @param {{ id: string }} team
 * @param {Record<string, { id: string }>} groupsByName
 */
async function ensureLabels(team, groupsByName) {
  /** @type {Record<string, string>} */
  const ids = {};

  for (const label of LABELS) {
    const current = indexByName(await listIssueLabels());
    let found = current.get(label.name.toLowerCase());
    const parentId = parentIdFor(groupsByName, label);

    if (found?.team) {
      const moved = await removeTeamScopedIssueLabel(found, team);
      if (moved) {
        found = undefined;
      }
    }

    if (found) {
      ids[label.name] = found.id;
      if (
        parentId &&
        parentId !== "dry-run" &&
        found.parent?.id !== parentId &&
        !DRY_RUN
      ) {
        await updateIssueLabel(found.id, { parentId });
        log(`Moved label "${label.name}" → group "${label.group}".`);
      } else {
        log(`Label "${label.name}" exists (workspace).`);
      }
      continue;
    }

    if (DRY_RUN || team.id === "dry-run") {
      log(`Would create workspace label "${label.name}".`);
      ids[label.name] = "dry-run";
      continue;
    }

    const input = {
      name: label.name,
      color: label.color,
      description: label.description,
    };
    if (parentId) {
      input.parentId = parentId;
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
      { input },
    );
    const node = created.issueLabelCreate.issueLabel;
    if (!created.issueLabelCreate.success || !node) {
      throw new Error(`Failed to create label ${label.name}.`);
    }
    log(`Created workspace label "${label.name}".`);
    ids[label.name] = node.id;
  }

  return ids;
}

/**
 * @param {Record<string, { id: string }>} groupsByName
 */
async function adoptIssueLabels(groupsByName) {
  if (ADOPT_LABELS.length === 0) {
    return;
  }
  const current = indexByName(await listIssueLabels());
  for (const label of ADOPT_LABELS) {
    const found = current.get(label.name.toLowerCase());
    const parentId = parentIdFor(groupsByName, label);
    if (!found) {
      log(`Adopt skipped: "${label.name}" does not exist.`);
      continue;
    }
    if (!parentId || parentId === "dry-run" || found.parent?.id === parentId) {
      log(`Adopted label "${found.name}" already in group "${label.group}".`);
      continue;
    }
    if (DRY_RUN) {
      log(`Would move adopted label "${found.name}" → group "${label.group}".`);
      continue;
    }
    await updateIssueLabel(found.id, { parentId });
    log(`Moved adopted label "${found.name}" → group "${label.group}".`);
  }
}

/**
 * @param {Record<string, { id: string }>} groupsByName
 */
async function ensureProjectLabels(groupsByName) {
  /** @type {Record<string, string>} */
  const ids = {};

  for (const label of PROJECT_LABELS) {
    const current = indexByName(await listProjectLabels());
    const found = current.get(label.name.toLowerCase());
    const parentId = parentIdFor(groupsByName, label);

    if (found) {
      ids[label.name] = found.id;
      if (
        parentId &&
        parentId !== "dry-run" &&
        found.parent?.id !== parentId &&
        !DRY_RUN
      ) {
        await updateProjectLabel(found.id, { parentId });
        log(`Moved project label "${label.name}" → group "${label.group}".`);
      } else {
        log(`Project label "${label.name}" exists.`);
      }
      continue;
    }

    if (DRY_RUN) {
      log(`Would create project label "${label.name}".`);
      ids[label.name] = "dry-run";
      continue;
    }

    const input = {
      name: label.name,
      color: label.color,
      description: label.description,
    };
    if (parentId) {
      input.parentId = parentId;
    }
    const created = await graphql(
      `
        mutation CreateProjectLabel($input: ProjectLabelCreateInput!) {
          projectLabelCreate(input: $input) {
            success
            projectLabel { id name }
          }
        }
      `,
      { input },
    );
    const node = created.projectLabelCreate.projectLabel;
    if (!created.projectLabelCreate.success || !node) {
      throw new Error(`Failed to create project label ${label.name}.`);
    }
    log(`Created project label "${label.name}".`);
    ids[label.name] = node.id;
  }

  return ids;
}

function writeSetup(team, states, labels, labelGroups, projectLabels, projectLabelGroups) {
  const setup = {
    product: config.product.name,
    team: { key: team.key, name: team.name, id: team.id },
    states: Object.fromEntries(
      STATES.map((state) => [
        state.name,
        { id: states[state.name].id, type: state.type },
      ]),
    ),
    labels,
    labelGroups,
    projectLabels,
    projectLabelGroups,
    delegateAgentName: config.linear.delegateAgentName,
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

/** @type {Record<string, { id: string }>} */
const issueGroups = {};
for (const group of ISSUE_LABEL_GROUPS) {
  issueGroups[group.name] = await ensureIssueGroup(group, team);
}

const labels = await ensureLabels(team, issueGroups);
await adoptIssueLabels(issueGroups);

/** @type {Record<string, { id: string }>} */
const projectGroups = {};
for (const group of PROJECT_LABEL_GROUPS) {
  projectGroups[group.name] = await ensureProjectGroup(group);
}
const projectLabels = await ensureProjectLabels(projectGroups);

writeSetup(
  team,
  states,
  labels,
  Object.fromEntries(Object.entries(issueGroups).map(([name, group]) => [name, group.id])),
  projectLabels,
  Object.fromEntries(Object.entries(projectGroups).map(([name, group]) => [name, group.id])),
);
log("Bootstrap complete. Re-run is safe (idempotent).");
