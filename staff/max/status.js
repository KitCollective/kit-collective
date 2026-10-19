// Max's daily status (staff/max.md, "Daily status (08:00)"). A bb script automation at 08:00
// Europe/Copenhagen that finds or makes Max's Staff chat and tells it to write the status there, so
// the status is a message in the one standing chat and no thread of its own.
//
// The stored copy inside bb is a snapshot: after a change here, run
//   bb automation update <id> --project <project> --script-file staff/max/status.js
// Runs on the bb server host with the project checkout as working directory.
// Env: DRY_RUN=1 prints what it would send and sends nothing. AGENT overrides the agent id.
// Written without static imports or import.meta so it runs whether bb stores it as CJS or ESM.

(async () => {
  const { execFileSync } = await import("node:child_process");

  const agent = process.env.AGENT ?? "max";
  const dryRun = process.env.DRY_RUN === "1";
  const bb = process.env.BB_CLI ?? "bb";

  // The message starts with the Optio marker, so the chat never takes it for the person's answer.
  const prompt = `[optio status] Write today's daily status here, in Danish, in five short sections and no more:
1. What landed since yesterday: issue, PR, auto-landed or by hand.
2. What is in Approval, and why.
3. What is stuck, and where.
4. Triage counts: up, down, question.
5. Anything you think I should decide, with your recommendation. A decision that is mine goes to me with \`bb optio ask ${agent} "<question>"\` as well.
Read Linear as you always do (\`LINEAR_ACTOR=${agent} node scripts/linear.mjs ...\`). Say what is known, what is guessed and what nobody has looked at.`;

  if (dryRun) {
    process.stdout.write(
      `DRY RUN: would run \`${bb} optio chat ${agent} --json\` and tell the chat a ${prompt.length}-character status request\n`,
    );
    return;
  }

  const run = (args, input) =>
    execFileSync(bb, args, {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });

  const { threadId } = JSON.parse(run(["optio", "chat", agent, "--json"]));
  try {
    run(["thread", "tell", threadId, "--mode", "auto", "--message-file", "-"], prompt);
  } catch (error) {
    // A chat that is busy is reported, not retried: the next day's status is the retry.
    process.stderr.write(
      `could not tell the Staff chat ${threadId}: ${String(error.message).split("\n")[0]}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`daily status requested in the Staff chat ${threadId}\n`);
})();
