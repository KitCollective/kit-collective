import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  factoryLockViolations,
  FACTORY_LOCK_PATHS,
  readFactoryLockFiles,
} from "./check-factory-locks.mjs";

function currentFiles() {
  return readFactoryLockFiles(".");
}

test("repo factory locks have no drift", () => {
  assert.deepEqual(factoryLockViolations(currentFiles()), []);
});

test("fails when orchestration treats Done as merge approval", () => {
  const files = currentFiles();
  files[FACTORY_LOCK_PATHS.orchestration] = files[FACTORY_LOCK_PATHS.orchestration].replace(
    "moving the issue to `Merging` is merge approval",
    "moving the issue to **Done** is merge approval",
  );
  const violations = factoryLockViolations(files);
  assert.ok(
    violations.some((item) => item.includes("treats Done as merge approval")),
  );
});

test("fails when factory.config.example.json omits Merging", () => {
  const files = currentFiles();
  const config = JSON.parse(files[FACTORY_LOCK_PATHS.exampleConfig]);
  config.states = config.states.filter((state) => state.name !== "Merging");
  files[FACTORY_LOCK_PATHS.exampleConfig] = `${JSON.stringify(config, null, 2)}\n`;
  const violations = factoryLockViolations(files);
  assert.ok(violations.some((item) => item.includes("missing Merging state")));
});

test("fails when Merging is not between Ready for merge and Done", () => {
  const files = currentFiles();
  const config = JSON.parse(files[FACTORY_LOCK_PATHS.exampleConfig]);
  config.states = [
    { name: "Ready for merge", type: "started", color: "#26b5ce" },
    { name: "Done", type: "completed", color: "#4cb782" },
    { name: "Merging", type: "started", color: "#219653" },
  ];
  files[FACTORY_LOCK_PATHS.exampleConfig] = `${JSON.stringify(config, null, 2)}\n`;
  const violations = factoryLockViolations(files);
  assert.ok(
    violations.some((item) => item.includes("between Ready for merge and Done")),
  );
});

test("fails when ci.yml drops check-factory-locks", () => {
  const files = currentFiles();
  files[FACTORY_LOCK_PATHS.ciWorkflow] = files[FACTORY_LOCK_PATHS.ciWorkflow].replaceAll(
    "check-factory-locks",
    "check-omitted-factory-locks",
  );
  const violations = factoryLockViolations(files);
  assert.ok(violations.some((item) => item.includes("missing check-factory-locks")));
});

test("fails when CONTEXT runtime block drops PI worker wording", () => {
  const files = currentFiles();
  files[FACTORY_LOCK_PATHS.context] = files[FACTORY_LOCK_PATHS.context].replace(
    "PI worker: Compose + `gh` + Linear CLI",
    "Cursor Cloud Agents execute factory work",
  );
  const violations = factoryLockViolations(files);
  assert.ok(violations.some((item) => item.includes("missing PI worker runtime block")));
});

test("repo example config includes Merging as started", () => {
  const config = JSON.parse(readFileSync(FACTORY_LOCK_PATHS.exampleConfig, "utf8"));
  const merging = config.states.find((state) => state.name === "Merging");
  assert.ok(merging);
  assert.equal(merging.type, "started");
});
