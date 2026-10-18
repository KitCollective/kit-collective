# Optio: install, reload, update

Optio is the bb plugin in `plugins/factory/` (plugin id `optio`, CLI `bb optio`; CONTEXT.md: **Optio**, ADR-0062). It runs inside the bb server on the owner's Mac and holds the Staff agents (Max, the Orchestrator), their memory and the Board. This page is how to get a merged change into the running plugin.

## The `bb` that builds it must match the app

`bb plugin build` compiles against the plugin SDK of the `bb` on your PATH, not the app's. The global npm package `bb-app` does not update itself with the desktop app: on 2026-10-17 it was 0.41.0 (SDK 0.4.34) while the app was 0.46.0, and the build failed on `experimental_Icon`. Check both before building:

```bash
bb --version
defaults read /Applications/bb.app/Contents/Info CFBundleShortVersionString
```

When they differ: `npm install -g bb-app@<app version>`. `bb plugin types --check plugins/factory` then says `pin is 0.6.37, host is 0.6.37`.

## First install (done 2026-10-17, KIT-358)

From the main checkout, on `development`:

```bash
pnpm install --frozen-lockfile --filter @kit/bb-plugin-optio...
bb plugin build plugins/factory
bb plugin install path:$PWD/plugins/factory --yes
```

Then the agents are created through the plugin's RPC (`agent_create`); Max's instructions are the system prompt in `staff/max.md`. The Board is set up on the plugin's page (Agents, Board) and starts in `dry-run`; see the next section.

## The Board reads the `loops` registry

What the Board starts is the `loops` block of `factory.config.json` in the project checkout, read on every tick through `bb.sdk.projects.fileContent` (the bb project's root, which on the owner's Mac is the main checkout). Editing the file on `development` changes the next tick; nothing is reloaded.

Each Loop has a `name`, a `trigger`, the `workflow` it runs (a file in `.bb/workflows/`), the `machines` it may use (ids as the page names them) and `maxLive`, how many of its runs may be live at once.

- `issue` trigger: `state`, `label`, `unblocked`, `skipLabels`, `priorityOrder`. It repeats the `dispatch` block of `factory.config.json` (the eligibility rules `WORKFLOW.md` defines), and a plugin test fails when the two differ. AFK developer is registered with it.
- `milestone-done` trigger: `states`. Defined, and it must stay `enabled: false`: a registry that switches it on is refused until the Board can match it.

Rules the Board keeps across Loops: a machine's `cap`, write-scope overlap with work in progress or an earlier start, the focus milestone first, and `flow.maxRunsPerDay` (starts of one issue in 24 hours, resumes included). A Loop that names a machine the page does not have makes its issues wait with `no machine "x"`.

A registry that does not parse (bad JSON, an unknown trigger, a duplicate Loop name, a negative `maxLive`) is refused: the Board plans, starts and moves nothing, `bb optio board` exits 1 and says why, the page shows the reason, and a `refusal` row is written. Every start, skip and refusal is a row in the plugin's record of runs (the `decisions` table), shown on the page under "Record of runs". A wait is written again only when its reason changes.

The setup form keeps the operating settings only (backlog, active and blocked states). A board stored before this change keeps its `workflow`, `dispatchState`, `readyLabel`, `skipLabels` and `priorityOrder`; the Board ignores them.

In `dry-run` the scheduled tick still reads the registry and records what it would start (`mode` is `dry-run` on the row) and applies nothing. That is the evidence for a registry change: `bb optio board --json` and the page show the Loops and the plan.

## The hand-over on the recorded review gate (KIT-364)

The AFK developer ends a green run ready in `In Review` and writes no `Approval` itself (ADR-0062). The Board moves the issue to `Approval` when it closes the ended run, if the review gate `optio_gate` recorded is green on the pull request's current head. It is off until the states are set:

```bash
bb optio hand-over --review "In Review" --approval Approval
bb optio hand-over            # shows the setting
bb optio hand-over --off      # back to: an ended run in a working state is a stall
```

It needs `github.ownerRepo` and `agent.workpadHeading` in `factory.config.json` (both are there) and `gh` on the machines the gates run on. Evidence for a run: the dispatch row (`bb optio dispatches`) ends `handed-over` with outcome `Approval`, `bb optio gates` shows the `review` record, and the Linear history shows the move by the Linear API key's user. With `flow.autoLand.enabled` on, a run takes the auto-land path and never reaches this hand-over.

## The Inbox (KIT-398)

Optio's first menu item in bb. It reads every issue in the Inbox state (`Approval`) from Linear on each open and on Refresh, with nothing cached: an issue that left `Approval` is gone on the next read. The page is laid out like a mail client: the messages on the left, the open message on the right. The open message is the panel's `subPath` (the issue identifier), so each message has its own link; on a narrow viewport the list and the message take turns. A message with `needs-info` or `ready-for-human` is a question: it shows the run's `### Waiting` ask and stage from the issue's workpad. Any other message is a green review: it shows the newest recorded `review` gate verdict line and the pull request's title. Green reviews come first, then questions, oldest in the state first inside each kind.

bb's left sidebar stays bb's thread list: a menu page cannot put its own list there. The sidebar becomes Optio's own (with the Inbox at the top) only through the thread list in KIT-405.

The state, the question labels and the bb project are Inbox configuration, not plugin code, so the plugin names no product value. The Inbox does not need the Board: it reads the Linear team (`linear.teamKey`) and the workpad heading from the project's `factory.config.json`. Without `--project` it uses the Board's project. Set them once on the install:

```bash
bb optio inbox --state Approval --labels needs-info,ready-for-human --project <bb project id>
bb optio inbox --off    # switch the Inbox off
```

`bb project list` shows the project id. Until the Inbox is set, `bb optio inbox` exits 1 and names this command, and the page says the same. `bb optio inbox [--json]` prints the same messages as the page. The code lives in `plugins/factory/src/inbox/` (RPC, Linear read, cards) and `plugins/factory/pages/inbox/` (the page); `app.tsx`, `server.ts` and `src/contract.ts` only register it.

### Approve and landing (KIT-400)

A green review has an **Approve** button. Approving writes one comment, `<approver> approved it from the Inbox.` (`approver` from the project's `factory.config.json`), and moves the issue to the merge-permission state (`Merging`) with its labels unchanged. That is a person's move to `Merging` (ADR-0061): the click is the approval. A card that left `Approval`, carries a question label or has no pull request attached is refused and nothing is written.

Optio then lands the PR itself, never through a model: it runs `scripts/land-approved.mjs` through its host bundle (`run_land`, the script fixed in `src/host-contract.ts`) on the runs machine, in that machine's main checkout, one slice at a time, and goes by the exit code and the verdict line. While the issue is out of the Inbox state it has a landing card of its own, with no action: approved (not enqueued yet), in the merge queue, merged (the land gate is waiting), `Done` (shown once). An issue that is in the Inbox state keeps its own card and its actions (Approve and Reject on a review, Answer on a question); a landing record only adds its landing box. Home lists no landing: nothing waits for a person on it, so Home counts and shows only the cards that do (`inbox.waiting`), and the landing kind and box are the Inbox page's own card type (`src/inbox/contract.ts`), not part of the card Home shares.

Every stop ends with a person told in Linear. The script's own stops (`STOPPED`) put the issue in `Approval` with `ready-for-human` and the reason, so it comes back as a question card that carries the stop reason; answering it ends the landing record. A slice that fails outside the script's own stops (the runs machine does not answer, `UNKNOWN`, a usage error or a line Optio cannot read) is handed over by the script's `stop` step with what happened as the reason. When that call fails too, the card keeps its phase and says why, and the first read of the Inbox after a wait of five minutes (`RETRY_WAIT_MS`) tries the slice again; a read inside the wait starts nothing. A `REFUSED` slice means the issue is not landing any more (a person moved it on), so the record ends and nothing is written. A stopped record whose issue left the Inbox state by any route (answered in Linear, landed by hand, `Done`, `Canceled`) is dropped on the next read. The records live in the plugin's kv (`landing:<issue>`), so a plugin reload picks a landing up again at its stored phase on the next read of the Inbox. The landing settings are set once, with the rest or alone:

```bash
bb optio inbox --approve-to Merging --land-host <runs machine host id> --land-checkout <absolute path of its main checkout>
```

Until they are set, Approve answers with this command. The script can also be run by hand on an issue a person moved to `Merging`:

```bash
node scripts/land-approved.mjs start <pr> --issue KIT-n [--timeout s]   # enqueue through landAtMergeGate
node scripts/land-approved.mjs finish <pr> --issue KIT-n [--timeout s]  # wait, Post-Merge, land gate, Done
node scripts/land-approved.mjs stop <pr> --issue KIT-n --reason <text>  # hand a landing issue to a person
```

`start` refuses an issue that is not `Merging` and writes nothing; a PR already queued or merged answers `QUEUED` again without a second enqueue. `finish` sets `Post-Merge` on the merge, runs `gate.mjs land`, and on an open gate comments the merge SHA and sets `Done`. A land gate still waiting at the end of the slice leaves the issue in `Post-Merge`. A PR the queue ejects (closed, or not queued on two polls), a closed land gate (a red integration check), a conflict or a refused enqueue is a stop: `Approval`, `ready-for-human` and one comment with the reason. A land gate that cannot decide (exit 2 or 4) or a `Post-Merge` write that fails is `UNKNOWN`, never waiting. `stop` hands an issue in `Merging` or `Post-Merge` to a person the same way and refuses any other. A hand-over writes the reason comment, then `ready-for-human`, then `Approval` as its last write, and writes a comment or label that is already there only once. A hand-over whose Linear writes fail is `UNKNOWN`, not `STOPPED`; a failure before the state write leaves the issue landing, so the next `stop` finishes the hand-over. One verdict line on every path: `QUEUED` or `LANDED` (exit 0), `WAITING (land-approved): <approved|queued|merged>: …` (exit 3, run it again), `STOPPED` (exit 1, handed to a person), `REFUSED` (exit 1, nothing written: the issue is not landing), `UNKNOWN` (exit 4), usage exit 2.

## Where a new area's code goes (KIT-412)

Optio's code is cut by area so tickets for different areas run side by side. The areas are `inbox`, `staff` (the Agents page: list, one agent, chat, memory, automations, follow-ups, Linear triggers, instructions), `board` (setup, machines, requirements, the plan) and `runs`. A new area `<area>` puts:

- its UI in `plugins/factory/pages/<area>/` (pieces several pages use go in `plugins/factory/pages/shared/`);
- its RPC handlers and `bb optio` commands in `plugins/factory/src/<area>/index.ts`, as `create<Area>(core)` returning `{ rpc }` and, when the area has commands, `cli` (`inbox` keeps its older `{ list, command }` shape), where `core` is the shared wiring from `src/core.ts` (settings, stores, sessions, the scheduler, the Linear key);
- its part of the RPC contract in `plugins/factory/src/<area>/contract.ts`, exported as `<area>Contract` (a type used by two areas goes in `src/shared/contract.ts`).

`app.tsx`, `server.ts` and `src/contract.ts` only register areas, no logic: `server.ts` takes an import, a `create<Area>(core)` call and an entry in the RPC and CLI registers; `src/contract.ts` takes an import and a spread; `app.tsx` takes an import and, for a new nav panel, a `navPanel({...})` call (or an entry in the views the Agents panel is handed). The stores, the scheduler, the Linear adapter and the host code stay in `src/` and are reached through `core`. The Board's write-scope overlap ignores those three registration files, as it ignores test globs under `apps/` and `packages/`, so two areas' tickets can declare `plugins/factory/src/<area>/**` and `plugins/factory/pages/<area>/**` and run together. A ticket that puts logic in a registration file, or more than those registration lines, is a sign the code belongs in an area.

## The reviewer proxy (ADR-0067)

A reviewer thread whose title ends in `:openrouter` runs Claude Code on an OpenRouter model. Optio gives that thread, and no other, `ANTHROPIC_BASE_URL` pointing at its route `/api/v1/plugins/optio/http/reviewer` and a token for that thread (`bb.providers.experimental_contributeEnv`); the route checks the token, refuses a model id that is not `vendor/model`, and forwards the call to OpenRouter with `OPENROUTER_API_KEY` from the key file named in Optio's settings (`linearApiKeyFile`), asking for endpoints that do not train on the data. The key never reaches the thread. `bb optio reviewer-served --thread <thr>` or `--title <exact title>` (the newest thread with that title in the caller's project, hidden and archived ones included; `--project` names another) says `SERVED <thr> as <model> (<n> calls)`, `NOT SERVED <thr>: ...` or `NOT FOUND: ...`; the AFK developer workflow asks by title, so the reviewer's thread id never comes from the model. The code is `plugins/factory/src/reviewer-proxy/`.

## After a merge that touches `plugins/factory/`

```bash
bash scripts/sync-development.sh
pnpm install --frozen-lockfile --filter @kit/bb-plugin-optio...
bb plugin build plugins/factory
bb plugin reload optio
```

The install is by path, so `reload` picks up the rebuilt `dist/` and keeps the plugin's settings, agents and memory. bb compiles the server side from `server.ts` in that checkout, not from `dist/`: a server change only runs once it is in the checkout the install points at, so a build from another worktree updates the page and nothing else. Never `bb plugin remove optio` to update it: removing deletes its database (agents, memory, automations). Do not `bb plugin disable optio` and `enable` it to pick up a change either: it unloads Optio while runs are live, and on 2026-10-17 two reviewers were cut off at their result, so their runs never started the fix round (KIT-290, KIT-411). `reload` is the update.

## What it replaced

The Meta Agents plugin (`bb meta-agents`, folder `~/Projects/bb-plugin-meta-agents`, repo `KitCollective/bb-plugin-meta-agents`) was removed on 2026-10-17. Its agents were Orchestrator, Max, DevOps and Frontend; the Orchestrator's five automations and four Linear triggers were all disabled and had never run, so none was carried over (KIT-358).

## Live checks

What only the running plugin can prove (it builds and reloads, the host bundle probes a thread, the Board answers) is a named live check in `scripts/lib/live-checks.mjs`: `optio-reload`, `optio-host-probe`, `optio-board` and `optio-inbox`. `node scripts/live-check.mjs list` shows them and `node scripts/live-check.mjs run <name> [--thread thr_x]` runs one from the main checkout, with one `LIVE-CHECK <name> pass|fail <line>` verdict. An issue names its checks on a `live-check:` line, and Max's live-check automation runs them after the merge (`staff/max.md`, Live checks). A new check is a reviewed change to that file, never text from an issue.
