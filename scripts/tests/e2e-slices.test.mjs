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
const WORKFLOWS = join(fileURLToPath(new URL("../..", import.meta.url)), ".github/workflows");

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
  for (const file of ["device-flows.yml", "scenario-flow.yml"]) {
    const blocks = runBlocks(readFileSync(join(WORKFLOWS, file), "utf8"));
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
