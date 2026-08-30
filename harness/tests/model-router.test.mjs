/**
 * Model router: gate + complexity + free rotation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelRoute,
  COMPOSER_MODEL,
  classifySliceComplexity,
  FREE_MODEL_ROTATION,
  formatModelRouteBrief,
  resolveImplementParentModel,
  rotateFreeChain,
  routeForGate,
} from "../model-router.mjs";

test("classifySliceComplexity marks auth/IAP as critical and Skip Draft", () => {
  const result = classifySliceComplexity({
    title: "Fix IAP restore",
    body: "Touch StoreKit entitlement refresh",
    writeScope: "apps/api/**",
    requiredHelpers: ["nest"],
  });
  assert.equal(result.tier, "critical");
  assert.equal(result.skipDraft, true);
  assert.ok(result.reasons.some((reason) => /critical|IAP|nest/i.test(reason)));
});

test("classifySliceComplexity treats small UI CRUD as simple", () => {
  const result = classifySliceComplexity({
    title: "Add padding to empty state",
    body: "Simple CSS/padding tweak on empty state scaffold",
    writeScope: "apps/mobile/**",
    requiredHelpers: ["expo", "ui-ux"],
    paths: ["apps/mobile/src/empty-state.tsx"],
  });
  assert.equal(result.tier, "simple");
  assert.equal(result.skipDraft, false);
});

test("scaffold gate uses free rotation; critical scaffold uses Composer", () => {
  const simple = routeForGate("scaffold", "simple", { rotationIndex: 0 });
  assert.equal(simple.primary, FREE_MODEL_ROTATION[0]);
  assert.equal(simple.useFree, true);
  assert.ok(simple.chain.includes(COMPOSER_MODEL));

  const critical = routeForGate("scaffold", "critical", { rotationIndex: 0 });
  assert.equal(critical.primary, COMPOSER_MODEL);
  assert.equal(critical.useFree, false);
});

test("implement critical is Composer; simple may start free", () => {
  const critical = routeForGate("implement", "critical");
  assert.equal(critical.primary, COMPOSER_MODEL);
  const simple = routeForGate("implement", "simple", { rotationIndex: 1 });
  assert.equal(simple.primary, FREE_MODEL_ROTATION[1]);
  assert.equal(simple.useFree, true);
});

test("verify prefers Hy3 then free rotation", () => {
  const verify = routeForGate("verify", "standard");
  assert.match(verify.primary, /hy3/);
  assert.ok(verify.chain.some((id) => id.includes(":free")));
});

test("rotateFreeChain cycles MiniMax → GLM → Laguna before paid", () => {
  assert.deepEqual(rotateFreeChain(0).slice(0, 3), [...FREE_MODEL_ROTATION]);
  assert.deepEqual(rotateFreeChain(1).slice(0, 3), [
    FREE_MODEL_ROTATION[1],
    FREE_MODEL_ROTATION[2],
    FREE_MODEL_ROTATION[0],
  ]);
});

test("buildModelRoute + brief mention complexity and fallback on 429", () => {
  const route = buildModelRoute({
    title: "Rename label",
    body: "typo rename scaffold",
    writeScope: "apps/mobile/**",
    requiredHelpers: ["expo"],
    paths: ["apps/mobile/src/label.tsx"],
    rotationIndex: 0,
  });
  const brief = formatModelRouteBrief(route);
  assert.match(brief, /Complexity:/);
  assert.match(brief, /429/);
  assert.match(brief, /Scaffold \(Draft\)|Draft/);
  assert.match(brief, /parent `--model`/);
});

test("empty slice defaults to standard — not free parent", () => {
  const result = classifySliceComplexity({});
  assert.equal(result.tier, "standard");
  assert.ok(result.reasons.some((reason) => /no slice signal/i.test(reason)));
  const route = buildModelRoute({});
  assert.equal(resolveImplementParentModel(route, COMPOSER_MODEL), COMPOSER_MODEL);
});

test("resolveImplementParentModel picks free primary for simple", () => {
  const route = buildModelRoute({
    title: "Add padding to empty state",
    body: "Simple CSS/padding tweak on empty state scaffold",
    writeScope: "apps/mobile/**",
    requiredHelpers: ["expo", "ui-ux"],
    paths: ["apps/mobile/src/empty-state.tsx"],
    rotationIndex: 0,
  });
  assert.equal(route.complexity.tier, "simple");
  assert.equal(route.gates.implement.useFree, true);
  assert.equal(resolveImplementParentModel(route, COMPOSER_MODEL), FREE_MODEL_ROTATION[0]);
});

test("resolveImplementParentModel keeps Composer for critical", () => {
  const route = buildModelRoute({
    title: "Fix IAP restore",
    body: "Touch StoreKit entitlement refresh",
    writeScope: "apps/api/**",
    requiredHelpers: ["nest"],
    rotationIndex: 0,
  });
  assert.equal(route.complexity.tier, "critical");
  assert.equal(resolveImplementParentModel(route, COMPOSER_MODEL), COMPOSER_MODEL);
});
