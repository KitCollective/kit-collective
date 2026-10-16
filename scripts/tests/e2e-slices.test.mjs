import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { flowOfKey, stepKey } from "../e2e/compare.mjs";
import {
  onlyFlows,
  sliceDesignSections,
  sliceFlowName,
  sliceSimulatorPhotos,
} from "../e2e/slices.mjs";

const MAESTRO = join(fileURLToPath(new URL("../..", import.meta.url)), "apps/mobile/.maestro");
const PHOTOS = join(MAESTRO, "fixtures/photos");
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WORKFLOWS = join(REPO_ROOT, ".github/workflows");
/** The Holdout producer's source (KIT-366): pushed to the Holdout repo, never run from here. */
const PRODUCER = join(REPO_ROOT, "docs/agents/holdout-scenario-flow.yml");

// simulator_photos() cut out of simulator.sh: the rest of the file needs xcrun.
function simulatorPhotos(env) {
  const shell = readFileSync(join(MAESTRO, "simulator.sh"), "utf8");
  const fn = /^simulator_photos\(\) \{[\s\S]*?^\}$/m.exec(shell)[0];
  const script = `maestro_dir=${JSON.stringify(MAESTRO)}\n${fn}\nsimulator_photos\n`;
  return execFileSync("bash", ["-c", script], {
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

test("the design sections come from the header comment of the slice flow", () => {
  const yaml = "# Device flow\n# design-sections: Sheet, Button dock ,Chip\nappId: x\n";
  assert.deepEqual(sliceDesignSections(yaml), ["Sheet", "Button dock", "Chip"]);
});

test("a slice flow without the comment, or with an empty list, asks for no extra sections", () => {
  assert.deepEqual(sliceDesignSections("appId: x\n"), []);
  assert.deepEqual(sliceDesignSections("# design-sections:\nappId: x\n"), []);
});

test("an issue key becomes the flow name in screenshot names", () => {
  assert.equal(sliceFlowName("KIT-279"), "kit-279");
});

test("a before run is cut to the flows of the after run, so other flows are not removed", () => {
  const before = new Map([
    [stepKey("collection", "01-collection"), "a"],
    [stepKey("kit-279", "01-sheet"), "b"],
  ]);
  const kept = onlyFlows(before, new Set(["kit-279"]), flowOfKey);
  assert.deepEqual([...kept.keys()], [stepKey("kit-279", "01-sheet")]);
});

test("a slice flow names its fixture photos in its header, in order", () => {
  const yaml =
    "# Device flow\n# simulator-photos: fck-white-home-front,  fck-white-home-back ,\nappId: x\n";
  assert.deepEqual(sliceSimulatorPhotos(yaml), ["fck-white-home-front", "fck-white-home-back"]);
  assert.deepEqual(sliceSimulatorPhotos("appId: x\n"), []);
  assert.deepEqual(sliceSimulatorPhotos("# simulator-photos:\nappId: x\n"), []);
});

test("simulator.sh reads the photo line the same way the scripts do", () => {
  // The shell cannot be sourced here (it needs xcrun), so its sed expression is run on its own.
  const shell = readFileSync(join(MAESTRO, "simulator.sh"), "utf8");
  const expression = /sed -n -E '([^']+)'/.exec(shell)[1];
  const yaml = "# Device flow\n# simulator-photos: a-front, b-back,c-front\nappId: x\n";
  const line = execFileSync("sed", ["-n", "-E", expression], { input: yaml, encoding: "utf8" });
  const shellNames = line
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  assert.deepEqual(shellNames, sliceSimulatorPhotos(yaml));
});

test("the photo catalog matches the files: names, jerseys and angles are all accounted for", () => {
  const catalog = JSON.parse(readFileSync(join(PHOTOS, "catalog.json"), "utf8"));
  const files = readdirSync(PHOTOS).filter((file) => file.endsWith(".jpg"));
  const names = catalog.photos.map((photo) => photo.name);
  assert.equal(new Set(names).size, names.length, "photo names are unique");
  assert.deepEqual([...names].sort(), files.map((file) => file.replace(/\.jpg$/, "")).sort());
  for (const photo of catalog.photos) {
    assert.match(photo.name, /^[a-z0-9][a-z0-9-]*$/, photo.name);
    assert.ok(catalog.jerseys[photo.jersey], `${photo.name}: jersey ${photo.jersey} is described`);
    assert.ok(catalog.angles[photo.angle], `${photo.name}: angle ${photo.angle} is defined`);
  }
});

test("every slice flow asks only for photos that exist", () => {
  const slices = join(MAESTRO, "slices");
  for (const file of readdirSync(slices).filter((name) => name.endsWith(".yaml"))) {
    for (const name of sliceSimulatorPhotos(readFileSync(join(slices, file), "utf8"))) {
      assert.ok(existsSync(join(PHOTOS, `${name}.jpg`)), `${file}: no fixture photo named ${name}`);
    }
  }
});

// check_simulator_photos() cut out of simulator.sh, run on its own: exit code and stderr.
function checkSimulatorPhotos(env) {
  const shell = readFileSync(join(MAESTRO, "simulator.sh"), "utf8");
  const fn = /^check_simulator_photos\(\) \{[\s\S]*?^\}$/m.exec(shell)?.[0];
  assert.ok(fn, "simulator.sh has check_simulator_photos()");
  const script = `maestro_dir=${JSON.stringify(MAESTRO)}\n${fn}\ncheck_simulator_photos\n`;
  try {
    execFileSync("bash", ["-c", script], {
      env: { PATH: process.env.PATH, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stderr: "" };
  } catch (error) {
    return { status: error.status, stderr: String(error.stderr) };
  }
}

test("a malformed simulator-photos entry of an artifact run is named by its position only, never its text (KIT-366)", () => {
  const secret = "the-collector-SECRET-WORDS";
  const real = readdirSync(PHOTOS)
    .find((file) => file.endsWith(".jpg"))
    .replace(/\.jpg$/, "");
  const photos = `${real}\n${secret}`;
  for (const env of [
    { E2E_FLOWS: "artifact", E2E_FLOW_FILE: "/x/apps/mobile/.maestro/external/scn.yaml" },
    { E2E_FLOWS: "slice", E2E_FLOW_FILE: "/x/apps/mobile/.maestro/external/scn.yaml" },
    { E2E_FLOWS: "artifact" },
  ]) {
    const result = checkSimulatorPhotos({ ...env, E2E_SIMULATOR_PHOTOS: photos });
    assert.equal(result.status, 2, JSON.stringify(env));
    assert.ok(!result.stderr.includes(secret), result.stderr);
    assert.match(result.stderr, /entry 2 /);
  }
  // A slice flow is in the repo: its bad name is shown, as before.
  const slice = checkSimulatorPhotos({ E2E_FLOWS: "slice", E2E_SIMULATOR_PHOTOS: photos });
  assert.equal(slice.status, 2);
  assert.ok(slice.stderr.includes(secret), slice.stderr);
  assert.equal(
    checkSimulatorPhotos({ E2E_FLOWS: "artifact", E2E_SIMULATOR_PHOTOS: real }).status,
    0,
  );
});

test("a flow from a run artifact names its photos in its own header", () => {
  const dir = mkdtempSync(join(tmpdir(), "e2e-flow-"));
  const flow = join(dir, "scenario-smoke.yaml");
  writeFileSync(flow, "# simulator-photos: a-front, b-back\nappId: x\n");
  // No slice flow exists for this key, so the photos can only come from the named file.
  const env = { E2E_FLOWS: "artifact", E2E_ISSUE: "KIT-0", E2E_FLOW_FILE: flow };
  assert.deepEqual(simulatorPhotos(env), ["a-front", "b-back"]);
  writeFileSync(flow, "appId: x\n");
  assert.deepEqual(simulatorPhotos(env), []);
  // Without the named file the issue's slice flow still decides.
  const slice = sliceSimulatorPhotos(readFileSync(join(MAESTRO, "slices/KIT-283.yaml"), "utf8"));
  assert.ok(slice.length > 0);
  assert.deepEqual(simulatorPhotos({ E2E_FLOWS: "slice", E2E_ISSUE: "kit-283" }), slice);
});

// The text of each `run:` block in a workflow, block scalars included.
function runBlocks(yaml) {
  const blocks = [];
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*(?:- )?)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const body = [match[2]];
    const indent = match[1].length;
    const deeper = (line) => line.trim() === "" || /^\s*/.exec(line)[0].length > indent;
    while (i + 1 < lines.length && deeper(lines[i + 1])) {
      body.push(lines[++i]);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

test("dispatch inputs reach the Device flow workflows' shell only through env", () => {
  for (const file of [join(WORKFLOWS, "device-flows.yml"), PRODUCER]) {
    const blocks = runBlocks(readFileSync(file, "utf8"));
    assert.ok(blocks.length > 0, `${file} has run steps`);
    for (const block of blocks) {
      assert.doesNotMatch(
        block,
        /\$\{\{[^}]*(inputs\.|github\.event\.inputs)/,
        `${file}: ${block}`,
      );
    }
  }
});

/** The `- name:` steps of a workflow, each as its text, in order. */
function steps(yaml) {
  return yaml.split(/\n(?=\s*- (?:name|uses):)/).slice(1);
}

test("no producer runs in kit-collective: the flow's text never enters this repo's runs (KIT-366)", () => {
  assert.ok(!existsSync(join(WORKFLOWS, "scenario-flow.yml")));
  const producer = readFileSync(PRODUCER, "utf8");
  assert.match(producer, /^on:\n {2}workflow_dispatch:\n/m);
  assert.doesNotMatch(producer, /pull_request/);
  assert.match(producer, /retention-days: 1\n/);
  assert.match(producer, /name: scenario-flow-\$\{\{ inputs\.name \}\}/);
});

test("an artifact run downloads the flow from the Holdout repo with SCENARIO_FLOWS_TOKEN only", () => {
  const yaml = readFileSync(join(WORKFLOWS, "device-flows.yml"), "utf8");
  const download = steps(yaml).find((step) => step.includes("actions/download-artifact"));
  assert.ok(download, "device-flows.yml has a download step");
  assert.match(download, /repository: \$\{\{ steps\.holdout\.outputs\.repo \}\}/);
  assert.match(download, /github-token: \$\{\{ secrets\.SCENARIO_FLOWS_TOKEN \}\}/);
  assert.match(download, /run-id: \$\{\{ inputs\.flow_run \}\}/);
  // The repo is read from factory.config.json, never typed into the workflow.
  const holdout = steps(yaml).find((step) => /id: holdout\n/.test(step));
  assert.ok(holdout, "a step with id holdout");
  assert.match(holdout, /scenarios\.holdoutRepo/);
  // An empty secret stops the run in seconds, naming the wizard.
  assert.match(yaml, /secrets\.SCENARIO_FLOWS_TOKEN[\s\S]*holdout-flows-wizard\.sh/);
  assert.equal((yaml.match(/secrets\.SCENARIO_FLOWS_TOKEN/g) ?? []).length, 2);
  assert.doesNotMatch(yaml, /actions: read/);
});

test("an artifact run keeps Maestro's console out of the log and uploads only the pruned evidence", () => {
  const yaml = readFileSync(join(WORKFLOWS, "device-flows.yml"), "utf8");
  const all = steps(yaml);
  const flows = all.find((step) => /id: flows\n/.test(step));
  assert.match(flows, /RUNNER_TEMP/);
  assert.match(flows, /E2E_FLOWS" == artifact/);
  const evidenceAt = all.findIndex((step) => step.includes("scripts/scenarios.mjs evidence --dir"));
  assert.ok(evidenceAt > all.indexOf(flows), "evidence runs after the flows");
  const uploads = all
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.includes("actions/upload-artifact"));
  assert.equal(uploads.length, 2);
  const artifactUpload = uploads.find(({ step }) => step.includes("== 'artifact'"));
  const otherUpload = uploads.find(({ step }) => step.includes("!= 'artifact'"));
  assert.ok(artifactUpload && otherUpload, "one upload per kind of run");
  assert.ok(artifactUpload.index > evidenceAt);
  assert.match(artifactUpload.step, /steps\.evidence\.outcome == 'success'/);
  assert.doesNotMatch(artifactUpload.step, /local-api\.log/);
  assert.match(otherUpload.step, /local-api\.log/);
});

// The macOS runner and the approver's Mac run these under /bin/bash 3.2, which has none of these.
const BASH4 =
  /\b(mapfile|readarray)\b|\b(declare|local|typeset) -A\b|\$\{[A-Za-z_]+(,,|\^\^)\}|shopt -s globstar|&>>/;

test("shell that runs on macOS uses no bash 4 builtins", () => {
  const scripts = [
    ...runBlocks(readFileSync(join(WORKFLOWS, "device-flows.yml"), "utf8")).map((block) => [
      "device-flows.yml",
      block,
    ]),
    ...readdirSync(MAESTRO)
      .filter((name) => name.endsWith(".sh"))
      .map((name) => [name, readFileSync(join(MAESTRO, name), "utf8")]),
  ];
  for (const [name, text] of scripts) {
    for (const line of text.split("\n").filter((l) => !/^\s*#/.test(l))) {
      assert.doesNotMatch(line, BASH4, `${name}: ${line.trim()}`);
    }
  }
});
