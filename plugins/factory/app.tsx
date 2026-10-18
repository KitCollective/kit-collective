// bb-plugin-optio — the Agents page and the Inbox.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never bundled),
// so this file must be loaded by BB, not imported directly.
//
// This file only registers the areas; each area's UI is pages/<area>/ and the pieces several
// pages use are pages/shared/. The Agents nav panel has four views chosen by `subPath`: the agent
// list (""), one agent ("<id>", or "new"), the orchestrator's board ("board") and the runs of
// every Loop ("runs"); the staff area owns the panel and the board and runs areas hand it theirs.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { Board } from "./pages/board";
import { Inbox } from "./pages/inbox";
import { Loops } from "./pages/loops";
import { Runs } from "./pages/runs";
import { PANEL } from "./pages/shared/common";
import { AgentPicker, Agents } from "./pages/staff";

const AGENT_VIEWS = { board: Board, runs: Runs };

function AgentsPanel({ subPath }: { subPath: string }) {
  return <Agents subPath={subPath} views={AGENT_VIEWS} />;
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "agent-picker",
    scopes: ["thread", "new-thread"],
    actions: [{ id: "pick-agent", component: AgentPicker }],
  });
  // bb lists the panels in the order they are registered, so the Inbox comes first.
  app.slots.navPanel({
    id: "inbox",
    title: "Inbox",
    icon: "Inbox",
    path: "inbox",
    component: Inbox,
  });
  app.slots.navPanel({
    id: "agents",
    title: "Agents",
    icon: "Bot",
    path: PANEL,
    component: AgentsPanel,
  });
  app.slots.navPanel({
    id: "loops",
    title: "Loops",
    icon: "Repeat",
    path: "loops",
    component: Loops,
  });
});
