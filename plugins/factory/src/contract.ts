// The RPC contract between server.ts and app.tsx. Each area owns its part in src/<area>/contract.ts;
// adding an area adds one import and one spread here. Both schemas of a method run at the wire boundary.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { boardContract } from "./board/contract.js";
import { homeContract } from "./home/contract.js";
import { inboxContract } from "./inbox/contract.js";
import { loopsContract } from "./loops/contract.js";
import { runsContract } from "./runs/contract.js";
import { staffContract } from "./staff/contract.js";
import { threadsContract } from "./threads/contract.js";

export const rpcContract = defineRpcContract({
  ...staffContract,
  ...boardContract,
  ...runsContract,
  ...inboxContract,
  ...loopsContract,
  ...homeContract,
  ...threadsContract,
});

/** Realtime channel: any agent, memory, automation or board change. */
export const CHANGED = "changed";
