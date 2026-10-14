#!/usr/bin/env node
/**
 * Asks for the hosted Device flows run of a PR head (ADR-0059). The run is the macOS job of
 * .github/workflows/device-flows.yml, started by the `run-device-flows` label; it sets the
 * `Device flows` commit status that the pre-review gate waits for.
 *
 * Usage: node scripts/request-device-flows.mjs <pr> --issue KIT-n
 * Nothing is asked for when the PR has no slice flow for the issue, or when the head already has
 * a pending, green or red `Device flows` status (a red flow is fixed by a commit, which is a new
 * head). An `error` status is a run that stopped before the flow finished: it is asked for again.
 * Prints one line. Exit: 0 requested or nothing to do, 2 usage, 4 a source could not be read.
 */
import { commitStatuses, config, existsAtHead, gh, prView } from "./lib/gate-io.mjs";
import { DEVICE_FLOWS_LABEL, deviceFlowsRequest, sliceFlowPath } from "./lib/gates.mjs";

const args = process.argv.slice(2);
const pr = args[0];
const issueAt = args.indexOf("--issue");
const issue = issueAt === -1 ? undefined : args[issueAt + 1];
if (!/^\d+$/.test(pr ?? "") || !/^[A-Z][A-Z0-9]*-\d+$/.test(issue ?? "")) {
  process.stderr.write("usage: request-device-flows.mjs <pr> --issue KIT-n\n");
  process.exit(2);
}
try {
  const repo = config().github.ownerRepo;
  const head = (await prView(pr)).headRefOid;
  const decision = deviceFlowsRequest({
    hasSliceFlow: await existsAtHead(sliceFlowPath(issue), head),
    statuses: await commitStatuses(head),
  });
  if (decision.request) {
    // The workflow starts on `labeled`, so a label that is already there is taken off first.
    await gh(["pr", "edit", pr, "--repo", repo, "--remove-label", DEVICE_FLOWS_LABEL]).catch(
      () => {},
    );
    await gh(["pr", "edit", pr, "--repo", repo, "--add-label", DEVICE_FLOWS_LABEL]);
  }
  process.stdout.write(`${decision.line} (${head.slice(0, 8)})\n`);
} catch (error) {
  process.stdout.write(`UNKNOWN: ${String(error.stderr || error.message).split("\n")[0]}\n`);
  process.exit(4);
}
