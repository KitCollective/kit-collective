import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CI_WORKFLOW_PATH,
  missingFactoryCiCoverage,
  PACKAGE_JSON_PATH,
} from "../check-factory-ci-tests.mjs";

function currentFiles() {
  return {
    workflowSource: readFileSync(CI_WORKFLOW_PATH, "utf8"),
    packageSource: readFileSync(PACKAGE_JSON_PATH, "utf8"),
  };
}

test("required GitHub test job runs harness, webhook-router, and land-policy tests", () => {
  assert.deepEqual(missingFactoryCiCoverage(currentFiles()), []);
});

test("coverage fails when the test job omits harness/tests", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    workflowSource: files.workflowSource.replaceAll("harness/tests", "omitted-harness"),
    packageSource: files.packageSource.replaceAll("harness/tests", "omitted-harness"),
  };
  const missing = missingFactoryCiCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("harness/tests")));
});

test("coverage fails when the test job omits webhook-router", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    workflowSource: files.workflowSource.replaceAll("webhook-router", "omitted-router"),
    packageSource: files.packageSource.replaceAll("webhook-router", "omitted-router"),
  };
  const missing = missingFactoryCiCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("webhook-router")));
});

test("coverage fails when the test job omits land-policy", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    workflowSource: files.workflowSource.replaceAll("land-policy", "omitted-land"),
    packageSource: files.packageSource.replaceAll("land-policy", "omitted-land"),
  };
  const missing = missingFactoryCiCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("land-policy")));
});

test("coverage fails when land-policy is omitted from the script body while the step title still names it", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    packageSource: files.packageSource.replace(
      "scripts/tests/land-policy.test.mjs",
      "scripts/tests/omitted-land.test.mjs",
    ),
  };
  assert.match(mutated.workflowSource, /land-policy/);
  const missing = missingFactoryCiCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("land-policy")));
});

test("coverage fails when a mobile check-script leaves the test job", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    workflowSource: files.workflowSource.replaceAll(
      "check:mobile-tab-bar",
      "check:omitted-tab-bar",
    ),
  };
  const missing = missingFactoryCiCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("check:mobile-tab-bar")));
});

test("coverage fails when factory tests are continue-on-error", () => {
  const files = currentFiles();
  let mutatedWorkflow = files.workflowSource;
  if (mutatedWorkflow.includes("run: pnpm test:harness")) {
    mutatedWorkflow = mutatedWorkflow.replace(
      "run: pnpm test:harness",
      "continue-on-error: true\n        run: pnpm test:harness",
    );
  } else {
    mutatedWorkflow +=
      "\n      - name: Test harness\n        continue-on-error: true\n        run: node --test harness/tests\n";
  }
  const missing = missingFactoryCiCoverage({
    workflowSource: mutatedWorkflow,
    packageSource: files.packageSource,
  });
  assert.ok(missing.some((item) => item.includes("continue-on-error")));
});

test("coverage fails when pull_request does not include the integration lane", () => {
  const files = currentFiles();
  const mutated = {
    ...files,
    workflowSource: files.workflowSource.replace(
      "pull_request:\n    branches: [development, staging, production]",
      "pull_request:\n    branches: [staging, production]",
    ),
  };
  const missing = missingFactoryCiCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("pull_request into development")));
});
