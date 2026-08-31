/**
 * Model router: gate + complexity + free rotation + profile.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelRoute,
  COMPOSER_MODEL,
  classifySliceComplexity,
  ECONOMY_FAST_MODEL,
  economyAgentModelSpec,
  FREE_MODEL_ROTATION,
  formatModelRouteBrief,
  parseModelProfile,
  resolveFastRoleModel,
  resolveImplementParentModel,
  rewriteAgentModelFrontmatter,
  rotateEconomyChain,
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

test("scaffold gate uses free rotation; critical scaffold uses Composer (balanced)", () => {
  const simple = routeForGate("scaffold", "simple", { rotationIndex: 0 });
  assert.equal(simple.primary, FREE_MODEL_ROTATION[0]);
  assert.equal(simple.useFree, true);
  assert.ok(simple.chain.includes(COMPOSER_MODEL));

  const critical = routeForGate("scaffold", "critical", { rotationIndex: 0 });
  assert.equal(critical.primary, COMPOSER_MODEL);
  assert.equal(critical.useFree, false);
});

test("economy scaffold uses free rotation even on critical tier", () => {
  const critical = routeForGate("scaffold", "critical", {
    rotationIndex: 0,
    profile: "economy",
  });
  assert.equal(critical.primary, FREE_MODEL_ROTATION[0]);
  assert.equal(critical.useFree, true);
});

test("implement critical is Composer; simple may start free", () => {
  const critical = routeForGate("implement", "critical");
  assert.equal(critical.primary, COMPOSER_MODEL);
  const simple = routeForGate("implement", "simple", { rotationIndex: 1 });
  assert.equal(simple.primary, FREE_MODEL_ROTATION[1]);
  assert.equal(simple.useFree, true);
});

test("economy implement uses free primary on all tiers including critical — no Composer", () => {
  for (const tier of /** @type {const} */ (["simple", "standard", "critical"])) {
    const routed = routeForGate("implement", tier, {
      rotationIndex: 0,
      profile: "economy",
    });
    assert.equal(routed.primary, FREE_MODEL_ROTATION[0]);
    assert.equal(routed.useFree, true);
    assert.equal(
      routed.chain.some((id) => id.includes("composer")),
      false,
      `${tier} chain must not include Composer`,
    );
  }
});

test("premium implement never starts free", () => {
  const simple = routeForGate("implement", "simple", {
    rotationIndex: 0,
    profile: "premium",
  });
  assert.equal(simple.primary, COMPOSER_MODEL);
  assert.equal(simple.useFree, false);
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

test("buildModelRoute + brief mention complexity, profile, and fallback on 429", () => {
  const route = buildModelRoute({
    title: "Rename label",
    body: "typo rename scaffold",
    writeScope: "apps/mobile/**",
    requiredHelpers: ["expo"],
    paths: ["apps/mobile/src/label.tsx"],
    rotationIndex: 0,
    profile: "economy",
  });
  assert.equal(route.profile, "economy");
  const brief = formatModelRouteBrief(route);
  assert.match(brief, /Profile: \*\*economy\*\*/);
  assert.match(brief, /Complexity:/);
  assert.match(brief, /429/);
  assert.match(brief, /Scaffold \(Draft\)|Draft/);
  assert.match(brief, /parent `--model`/);
});

test("empty slice defaults to standard — not free parent (balanced)", () => {
  const result = classifySliceComplexity({});
  assert.equal(result.tier, "standard");
  assert.ok(result.reasons.some((reason) => /no slice signal/i.test(reason)));
  const route = buildModelRoute({});
  assert.equal(route.profile, "balanced");
  assert.equal(resolveImplementParentModel(route, COMPOSER_MODEL), COMPOSER_MODEL);
});

test("economy empty/standard slice uses free parent", () => {
  const route = buildModelRoute({ profile: "economy", rotationIndex: 0 });
  assert.equal(route.complexity.tier, "standard");
  assert.equal(route.gates.implement.useFree, true);
  assert.equal(resolveImplementParentModel(route, COMPOSER_MODEL), FREE_MODEL_ROTATION[0]);
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

test("resolveImplementParentModel uses OpenRouter for critical under economy", () => {
  const route = buildModelRoute({
    title: "Fix IAP restore",
    body: "Touch StoreKit entitlement refresh",
    writeScope: "apps/api/**",
    requiredHelpers: ["nest"],
    rotationIndex: 0,
    profile: "economy",
  });
  assert.equal(route.complexity.tier, "critical");
  assert.equal(resolveImplementParentModel(route, COMPOSER_MODEL), FREE_MODEL_ROTATION[0]);
  assert.equal(route.gates.implement.chain.some((id) => /composer/i.test(id)), false);
});

test("premium resolveImplementParentModel ignores free route", () => {
  const route = buildModelRoute({
    title: "Add padding to empty state",
    body: "Simple CSS/padding tweak on empty state scaffold",
    writeScope: "apps/mobile/**",
    requiredHelpers: ["expo", "ui-ux"],
    paths: ["apps/mobile/src/empty-state.tsx"],
    rotationIndex: 0,
    profile: "premium",
  });
  assert.equal(resolveImplementParentModel(route, COMPOSER_MODEL), COMPOSER_MODEL);
});

test("parseModelProfile defaults unknown to balanced", () => {
  assert.equal(parseModelProfile(undefined), "balanced");
  assert.equal(parseModelProfile(""), "balanced");
  assert.equal(parseModelProfile("ECONOMY"), "economy");
  assert.equal(parseModelProfile("nope"), "balanced");
});

test("resolveFastRoleModel swaps Grok for Hy3 in economy", () => {
  assert.equal(resolveFastRoleModel("balanced", "cursor/grok-4.6"), "cursor/grok-4.6");
  assert.equal(resolveFastRoleModel("economy", "cursor/grok-4.6"), ECONOMY_FAST_MODEL);
  assert.match(ECONOMY_FAST_MODEL, /openrouter\/tencent\/hy3/);
});

test("economy agent pins never name Composer", () => {
  for (const name of ["nest.md", "scout.md", "gate.md", "draft.md", "slop.md"]) {
    const pins = economyAgentModelSpec(name, 0);
    assert.equal(/composer/i.test(pins.model), false, name);
    assert.equal(pins.fallbackModels.some((id) => /composer/i.test(id)), false, name);
  }
  assert.equal(rotateEconomyChain(0).some((id) => /composer/i.test(id)), false);
  const rewritten = rewriteAgentModelFrontmatter(
    "---\nname: nest\nmodel: cursor/composer-2.5\n---\n\nBody\n",
    economyAgentModelSpec("nest.md", 0),
  );
  assert.match(rewritten, /^model:\s+openrouter\//m);
  assert.doesNotMatch(rewritten, /composer/i);
});
