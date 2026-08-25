import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDelegateGateConfig,
  delegateGate,
  PI_BOT_AGENT_NAME,
} from "../delegate-gate.mjs";

test("delegate gate accepts Pi and Pi Bot Agent display names", () => {
  const config = createDelegateGateConfig({ LINEAR_PI_APP_USER_ID: "pi-app-1" });
  assert.equal(delegateGate({ name: "Pi" }, config), "pi");
  assert.equal(delegateGate({ name: PI_BOT_AGENT_NAME }, config), "pi");
  assert.equal(delegateGate({ name: "Cursor" }, config), "blocked");
  assert.equal(delegateGate(null, config), "none");
});

test("delegate gate accepts the installed app user id", () => {
  const config = createDelegateGateConfig({ LINEAR_PI_APP_USER_ID: "pi-app-1" });
  assert.equal(delegateGate({ id: "pi-app-1", name: "Anything" }, config), "pi");
  assert.equal(delegateGate({ id: "pi-app-1" }, config), "pi");
  assert.equal(delegateGate({ id: "other-user", name: "Pi Bot Agent" }, config), "pi");
});
