// bb-plugin-optio — standing agents with instructions, memory and
// automations, and the orchestrator's board.
//
// An agent is a row in the plugin's database: a name, a project and standing
// instructions. Every way of starting it (a chat from the Agents page, an
// automation, an HTTP trigger, `bb optio trigger`) spawns one bb thread
// that is told to read the agent's brief: its instructions plus the memory it
// has saved in earlier sessions. An automation can also start a named bb
// workflow instead of asking the agent.
//
// The board is the orchestrator's standing half: every minute it reads a
// Linear team's issues, starts the ones that are unblocked and fit a machine's
// capacity, and hands each run that stopped at a gate to the orchestrator
// agent's thread.
//
// This file only registers the areas; the shared wiring is src/core.ts and each area's server
// side is src/<area>/. A new area adds one import, one create call and one line to each register.
import { type BbPluginApi, defineCli } from "@get-bb/plugin-sdk";
import { createBoard } from "./src/board/index.js";
import { rpcContract } from "./src/contract.js";
import { createCore } from "./src/core.js";
import { createHome } from "./src/home/index.js";
import { createInbox } from "./src/inbox/index.js";
import { createLoops } from "./src/loops/index.js";
import { createReviewerProxy } from "./src/reviewer-proxy/index.js";
import { createRuns } from "./src/runs/index.js";
import { createStaff } from "./src/staff/index.js";
import { createThreads } from "./src/threads/index.js";

export default async function plugin(bb: BbPluginApi) {
  const core = createCore(bb);
  const staff = createStaff(core);
  const board = createBoard(core);
  const runs = createRuns(core);
  const inbox = createInbox(core);
  const loops = createLoops(core);
  const home = createHome({ inbox });
  const threads = createThreads(core);
  const reviewerProxy = createReviewerProxy({
    bb: core.bb,
    keyFile: async () => (await core.settings.get()).linearApiKeyFile,
  });
  reviewerProxy.register();

  bb.rpc.register(rpcContract, {
    ...staff.rpc,
    ...board.rpc,
    ...runs.rpc,
    ...threads.rpc,
    ...home.rpc,
    inbox_list: inbox.list,
    ...loops.rpc,
    inbox_answer: inbox.answer,
    inbox_read: inbox.read,
    inbox_reject: inbox.reject,
  });

  bb.cli.register(
    defineCli({
      name: "optio",
      summary: "Standing agents: their brief and memory, their runs, and the orchestrator's board",
      commands: {
        ...staff.cli,
        ...board.cli,
        inbox: inbox.command,
        ...reviewerProxy.cli,
        ...loops.cli,
      },
    }),
  );
}
