# Factory plugin

Kickoff spec, 2026-10-15. Grilled in `/grill-with-docs` the same day; decisions in `docs/adr/0061-the-factory-dispatches-and-owns-gate-verdicts.md`; terms (Factory, Loop, Board, AFK developer, Milestone scenarios) in `CONTEXT.md`. Background: `.scratch/Research/dark-factory.md`.

## Problem Statement

Nicklas runs KitCollective through Linear and wants the factory around it to work unattended, so he spends his time on specs and decisions instead of starting and watching runs. Today the pieces that do this grew up separately and disagree: a script automation wakes a model thread every five minutes that decides which issues to start, while the docs say nothing dispatches; the Meta Agents plugin has a better, deterministic board but runs in dry-run, lives in a folder with no commits and no remote, and hardcodes one workflow; and every gate verdict in a run is read aloud by a runner model, so no verdict is merge-grade (ADR-0058). Adding a new kind of unattended work, such as Milestone scenarios now or marketing later, means writing another one-off dispatcher.

## Solution

One bb plugin, the **Factory**, kept in this repo and tested in its CI. Its **Board** is the only dispatcher: every tick it reads Linear, matches issues and milestones against a **Loop registry** in `factory.config.json`, and starts the right Loop within each machine's capacity and without write-scope overlap. A **Loop** is a trigger, the bb workflow it runs, its roles and its hand-over; AFK developer and Milestone scenarios are the first two, and a new Loop is a pull request, not new plugin code. Gates stop being relayed by a model: the Factory runs the gate script itself on the run's machine and records the verdict, and hand-over reads that record. A page in bb shows every run per Loop, where it stopped and why. The Orchestrator agent stays as the one standing agent, handling runs that stop at a gate.

## User Stories

1. As Nicklas, I want the Factory's source in the kit-collective repo, so that it has history, review and CI like everything else.
2. As Nicklas, I want the Factory installed from the repo by path, so that a merged change is what runs.
3. As Nicklas, I want the plugin's tests to run in CI on every PR that touches it, so that a broken Factory never lands.
4. As Nicklas, I want the plugin's id and command to be `factory` (`bb factory …`), so that the name says what it is.
5. As Nicklas, I want the Orchestrator agent re-created in the Factory from the seed, so that nothing I rely on is lost when Meta Agents is removed.
6. As Nicklas, I want the Orchestrator's existing automations reviewed before Meta Agents is removed, so that only the useful ones come back.
7. As Nicklas, I want DevOps and Frontend standing agents left out for now, so that the Factory does one job well; they remain roles inside AFK developer.
8. As Nicklas, I want the Factory's code to name no product, so that another repo could install it later with its own `factory.config.json`.
9. As Nicklas, I want a `loops` block in `factory.config.json` listing each Loop's trigger, workflow, eligible machines and maximum live runs, so that adding a Loop is a reviewed change.
10. As Nicklas, I want an "issue" trigger (status plus label, unblocked, not skipped by a triage label), so that AFK developer starts exactly the issues WORKFLOW.md calls dispatchable.
11. As Nicklas, I want a "milestone done" trigger defined from the start but switched off, so that Milestone scenarios can be enabled once it exists without changing the Board.
12. As Nicklas, I want the Board to keep its live/dry-run mode, capacity per machine and focus milestone as operating settings on its page, so that I steer it without a PR.
13. As Nicklas, I want the Board to refuse a registry it cannot parse and say why, so that a bad config stops dispatch instead of starting the wrong thing.
14. As Nicklas, I want the Board to run in dry-run beside the current dispatch script for a day and show where their choices differ, so that I trust it before it goes live.
15. As Nicklas, I want the dispatch script automation paused, not deleted, when the Board goes live, so that I can fall back.
16. As Nicklas, I want the script deleted after a week of clean live running, so that two dispatchers never come back.
17. As Nicklas, I want `AGENTS.md` and `WORKFLOW.md` to say the Board dispatches, so that agents stop reading "no dispatch worker runs".
18. As Nicklas, I want the Board to keep `flow.maxRunsPerDay` per issue, so that a looping issue still stops at the cap.
19. As the Board, I want to start a Loop through a launcher thread on the chosen machine, so that the workflow runs where its capabilities are, until bb offers a direct API.
20. As the Board, I want every start, skip and stop written to the Factory's record of runs with a reason, so that its choices are explainable after the fact.
21. As the Orchestrator, I want to be told when a run stops at a gate without a hand-over, with the run and the gate named, so that I can resume or park it.
22. As an agent in a Loop, I want a gate tool I call with the gate's name and arguments, so that I never run a gate script myself.
23. As the Factory, I want to run the gate script on the calling thread's machine, inside its worktree, so that the verdict is about the code the agent wrote.
24. As the Factory, I want to record each gate's exit code, verdict line, commit and thread, so that the verdict does not depend on a model's account.
25. As AFK developer, I want hand-over to `Approval` to read the Factory's recorded verdict, so that a run cannot reach `Approval` on a gate it did not pass.
26. As Nicklas, I want the gate tool proven by a spike before it is built, so that if a plugin cannot run a script in a worktree we find out first.
27. As Nicklas, I want one real AFK developer run whose `Approval` was decided by the recorded verdict, so that the change is shown, not claimed.
28. As Nicklas, I want a page in bb listing runs per Loop with their issue, machine, current step, where they stopped and why, so that I follow work without opening threads.
29. As Nicklas, I want a run on that page to link to its thread, workflow run and PR, so that I can go deeper when I need to.
30. As Nicklas, I want the Factory to keep working when Linear is unreachable for a tick, starting nothing and saying so, so that an outage never starts a wrong run.
31. As Nicklas, I want the Factory's Linear key kept as a plugin secret or read from the checkout's `.env`, never printed, so that secrets stay where they are today.

## Implementation Decisions

- **Home and identity.** The Meta Agents source moves into this repo as its own package with plugin id `factory`, CLI `bb factory`, and its own tests. It is installed by path from the main checkout; Meta Agents is removed after the Orchestrator is re-seeded. Product names (team key, workflow names, labels, states, lanes) come from `factory.config.json`, never from plugin code.
- **Loop registry.** `factory.config.json` gains a `loops` block. Each Loop has a name, a trigger, the workflow it runs, the machines it may use and a live-run cap. Two trigger kinds: *issue* (dispatch state, required label, unblocked, skip labels, priority order, write-scope rules as WORKFLOW.md defines them) and *milestone done* (every issue in a milestone `Done` or `Canceled`), the second shipped disabled. The Board reads the registry from the project checkout each tick and refuses a registry that does not parse. Operating settings (mode, machine capacity, focus milestone) stay plugin settings edited on the page.
- **Board.** The existing board planner becomes registry-driven instead of one hardcoded workflow; capacity, write-scope overlap, focus milestone and `flow.maxRunsPerDay` keep their current rules. It starts a Loop through a launcher thread (ADR-0061 known limit) and writes every decision to the record of runs.
- **Cutover.** Board in dry-run beside `kit-dispatch.js` for a day with a comparison of their choices; then Board live and the script automation paused in the same slice; the script deleted a week later. `AGENTS.md` and `WORKFLOW.md` change in the live slice to name the Board as dispatcher.
- **Gate tool.** The Factory registers an agent tool that takes a gate name from a fixed set and validated arguments, runs the repo's gate script on the calling thread's machine in its worktree through the plugin's host worker, and records exit code, verdict line, commit SHA and thread id. AFK developer's hand-over reads this record. A spike first proves the host worker can run a script in a thread's worktree; if not, the decision is reopened (ADR-0061).
- **Record of runs and page.** The Factory's existing ledgers become one record of runs per Loop (start, steps, gate verdicts, stop reason, links). The page lists it with filters per Loop and state.
- **Standing agents.** Only the Orchestrator is kept, with its brief and memory; stalled-run reports go to its thread as today.
- **Budget.** No per-Loop token or money budget in this project; `flow.maxRunsPerDay` stays the cap.

## Testing Decisions

- A good test drives a public interface and asserts behaviour: what the Board plans and starts for a given Linear board and registry, what the gate tool records for a given exit, what a workflow script hands over. Never internal state.
- **Seam F1, the plugin through its host.** The Factory is tested as today's Meta Agents is: its server registered against the fake plugin host with a real in-memory SQLite, Linear replaced by fixture boards. Covers registry parsing and refusal, trigger matching, capacity and write-scope, the per-day cap, launcher starts, the record of runs, the gate tool's recording, and the page's RPC. Prior art: Meta Agents' `scheduler.test.ts` and `server.test.ts`.
- **Seam S1, workflow scripts.** AFK developer's hand-over reading the recorded verdict is tested with the scripted fake `agent()`. Prior art: `scripts/tests/kit-issue-workflow.test.mjs`.
- The host worker running a script in a worktree, the dry-run comparison, and the first live and gate-decided runs are verified by real runs recorded as evidence on their issues.

## Out of Scope

- Marketing Loops, a marketing Linear team and marketing agents; Paperclip is parked as a candidate for that track.
- Per-Loop token or money budgets.
- Making the Factory installable in Optio or any other repo (only kept product-neutral).
- A direct bb API for starting workflows from a plugin (asked of bb separately).
- DevOps and Frontend standing agents.
- Merging, landing or promotion by the Factory; `Approval` stays a person's.
- The Holdout Scenarios work itself (its own project); this project only gives it a trigger.

## Linear

- **Project:** Factory plugin
- **Mode:** kickoff
- **Craft labels:** `craft:backend` (Linear allows one Craft label per project)
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. Factory in the repo — the plugin lives in this repo as `factory`, its tests run in CI, it is installed by path, the Orchestrator is re-seeded and Meta Agents is removed. Complete when `bb factory board` works from the repo install.
  2. Board dispatches Loops — the Loop registry in `factory.config.json`, the registry-driven Board, a day of dry-run beside the script, then live with the script paused and `AGENTS.md`/`WORKFLOW.md` rewritten. Complete when the Board has started a real run and the script automation is paused.
  3. Gates without a model — the host-worker spike, the gate tool, verdicts in the record of runs, and AFK developer's hand-over reading them. Complete when one real run reaches `Approval` on a recorded verdict.
  4. Runs page — one page in bb with every run per Loop, its step, stop reason and links. Complete when a run can be followed from start to hand-over without opening a thread.

## Further Notes

- Until milestone 2 is live, `kit-dispatch.js` keeps dispatching; it already started KIT-347 from Holdout Scenarios.
- Holdout Scenarios' KIT-350 renames `kit-issue` to AFK developer; the registry names whichever workflow exists when milestone 2 lands.
- The Meta Agents folder has no commits and no remote; until milestone 1 lands it is one disk failure from gone.
- ADR numbering: the unmerged `claude/auto-land` branch carries its own `0059-…`; it needs the next free number after 0061 when it lands.
