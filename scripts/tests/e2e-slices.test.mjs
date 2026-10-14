import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
