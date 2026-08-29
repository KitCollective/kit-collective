# Status dispatch, no AgentSession

Feature spec on **Factory leftovers**. Domain nouns: `CONTEXT.md`. Prior increment: Harness quality and slots (Done). Sibling in flight: Worker memory. Lanes: factory produces on `development`. Staging and production stay a later human Cursor promotion.

This is not a KitCollective product surface and not a new Seed ingest path.

Same class as the Cursor research (`.scratch/Research/linear-cursor-runtime.md`): Linear Agent / AgentSession is an overlay runtime. Dispatch is status + `ready-for-agent` + blockers. The factory already decided not to delegate to Cursor. This increment stops delegating to Pi as well, and removes the display-only AgentSession that existed only because planner set that delegate.

## Problem Statement

Nicklas cannot tell whether a slice is done by reading the issue body: Acceptance criteria stay unchecked after Done. The live “Pi is thinking” panel is Linear AgentSession UI, which only exists because planner sets delegate to Pi Bot Agent — the same product shape that starts a Cursor Cloud Agent when the agent is Cursor. That overlay costs OAuth actor tokens, a second HMAC, session ACK, and a Pi event stream, and it is not the control plane. Durable evidence lives in one overwritten workpad comment; role transitions are easy to miss.

## Solution

The control plane stays **status + `ready-for-agent` + unblocked**. Planner claims Backlog → Implementing. Implement wakes on Implementing. Checker wakes on In Review. Auto-merge or Nicklas moves Ready for merge → Merging. Land moves Merging → Done. Linear Agent stays empty: never set Cursor, never set Pi. If Agent is Cursor, skip and comment. AgentSession UI, session HMAC, and Pi activity streaming go away. Each factory role writes **one new issue comment** at its transition. Checker pass ticks Acceptance criteria in the **issue description** (or comments and rewrites a line that changed). The workpad stays the living Plan / Validation / Review feedback document.

## User Stories

1. As Nicklas, I want Linear Agent empty on every factory-claimed issue, so that neither Cursor nor Pi owns the Agent field.
2. As planner, I want to claim Backlog + `ready-for-agent` + unblocked into Implementing without setting `delegateId`, so that claim does not create an AgentSession.
3. As planner, I want to skip and comment when Linear Agent is Cursor, so that a Cloud Agent is not factory dispatch.
4. As planner, I want not to require `LINEAR_PI_APP_USER_ID` to claim, so that Pi app-user lookup is not a boot dependency for dispatch.
5. As implement, I want to enqueue when status is Implementing even if delegate is empty, so that Pi-as-delegate is not a silent skip.
6. As implement, I want still to skip when delegate is Cursor, so that the negative guard remains.
7. As factory-checker, I want to wake on In Review with no Pi-delegate requirement, so that review is status-only.
8. As Auto-merge, I want Ready for merge → Merging when the PR is MERGEABLE, required checks are green, and loop counters are under the cap, so that Pi-delegate is not the ownership flag.
9. As Auto-merge, I want a refuse (loop cap, CONFLICTING, missing counters) to stay Ready for merge and comment, so that Nicklas can still move Merging.
10. As Auto-merge, I want “delegate already empty” to stop being a refuse reason, so that empty Agent is the happy path.
11. As land, I want Merging → Done after merge to `development` with no leftover Pi delegate to clear as a success condition, so that Done is still merge-SHA.
12. As Nicklas, I want AgentSession created/prompted gone as a factory webhook path, so that “Tell Pi Bot Agent what to do next” cannot exist on the issue.
13. As the Issue webhook, I want session HMAC (`LINEAR_PI_WEBHOOK_SECRET`) unused, so that one Issue HMAC is enough.
14. As kit-harness, I want actor=app activity tokens (`LINEAR_PI_ACCESS_TOKEN`, `LINEAR_PI_CLIENT_ID`, `LINEAR_PI_CLIENT_SECRET`) unused, so that session ACK minting is not boot surface.
15. As compose rebuild, I want session-adapter and Pi event-stream modules gone, so that a box rebuild cannot resurrect the overlay.
16. As resume poller, I want Implementing without Pi still to enqueue implement, so that “Implementing without a Pi delegate is skipped” is deleted.
17. As Done / Canceled, I want leftover Pi delegate cleared if one remains, so that a historic claim cannot keep the Agent field occupied.
18. As planner claim, I want one Linear comment that the issue was claimed (eligible, unblocked, write-scope not overlapping), so that the timeline shows why it left Backlog.
19. As implement, I want one Linear comment when the harness moves to In Review (PR URL + what was built), so that the timeline shows the coding step without a second workpad.
20. As factory-checker on fail, I want `### Review feedback` on the existing workpad plus one short comment that the issue returned to Implementing, so that fail is visible without a new workpad thread.
21. As factory-checker on pass, I want one comment with a verdict per Acceptance criterion, so that Nicklas can see what was signed off before Merging.
22. As factory-checker on pass, I want those criteria ticked `[x]` in the issue **description**, so that the body matches Done later.
23. As factory-checker, I want to rewrite a description criterion and comment why when the slice changed the contract, so that an unchecked or stale line is not silently hakket af.
24. As factory-checker, I want not to tick a criterion that is unmet, so that pass cannot lie in the body.
25. As Auto-merge, I want one comment on flip to Merging or on refuse, so that loop-cap / conflict is on the issue, not only the workpad.
26. As land, I want one comment with the merge SHA on success (or merge error on return to Implementing), so that Done has a durable line besides workpad Evidence.
27. As the workpad, I want to stay one comment that is edited in place, so that Plan, Validation, loop counters, and Review feedback do not fork.
28. As implement, I want not to create a second `## Agent Workpad` comment, so that KIT-107’s duplicate workpad class cannot recur.
29. As `CONTEXT.md`, I want “Linear Agent stays empty” to match the worker, so that generated orchestration does not fight planner claim.
30. As ADR-0025, I want a supersession note that Auto-merge no longer keys on Pi delegate, so that agents do not keep Pi as ownership.
31. As `WORKFLOW.md`, I want eligibility, implement enqueue, Auto-merge, and checker pass to describe comments + description AC, so that Pi jobs follow the lock.
32. As `host.md` and `.env.example`, I want session/actor env names removed from required worker secrets, so that a new box does not mint AgentSession tokens.
33. As generate-harness-docs, I want the generated CONTEXT orchestration block regenerated after lock edits, so that `AGENTS.md` does not drift by hand.
34. As Intake, I want still never to set delegate or Implementing, so that this increment does not reopen Intake.
35. As Capacity gate, I want one in-place comment unchanged in shape, so that RAM-floor waits are not a new comment class.
36. As Nicklas, I want Cursor Cloud Agents still not to be factory dispatch, so that this increment does not reopen that research.
37. As Expo / Astro / Admin SPA, I want this increment not to change collector or Staff surfaces, so that product UI stays on their projects.
38. As `/tdd`, I want fakes at the existing worker seam, so that CI never posts a live AgentSession or spawns Pi.
39. As `/to-tickets`, I want slices on this milestone after this spec, so that we do not invent issues here.

## Implementation Decisions

- **Linear:** Feature on existing project **Factory leftovers**. Lead Nicklas. Priority None. New milestone **Status dispatch, no AgentSession** (own increment; factory still produces on `development`). Do not create a second project.
- **Modules:** Deepen the existing worker job lifecycle (planner claim, `dispatchIssue`, implement/checker/auto-merge/land exits, Linear comments, issue description). Delete the AgentSession overlay (session adapter, Pi event stream, session HMAC path, actor-token mint used only for activities). Do not add a Nest module.
- **Seam (one):** the worker job lifecycle — enqueue by Linear status, planner claim, implement/checker/auto-merge/land exits, Linear comment + description + workpad. Callers and tests cross this interface. AgentSession is not a second seam; it is removed.
- **Dispatch:** unchanged eligibility: `dispatch.state` + `ready-for-agent` + unblocked + not `signal-up`. Linear Agent empty is the happy path. Cursor in Agent → skip + comment. Never set Agent to Cursor. Never set Agent to Pi.
- **Planner claim mutation:** `stateId` to Implementing only. No `delegateId`. Drop the boot requirement that `LINEAR_PI_APP_USER_ID` must resolve to a Linear user before claim.
- **Implement enqueue:** status Implementing + Linear Type for ADW. Delegate empty or Pi leftover is not a skip. Delegate Cursor is a skip. Resume poller matches that rule (delete “Implementing without a Pi delegate is skipped”).
- **Auto-merge:** Ready for merge + MERGEABLE + required checks green + loop counters under cap. Pi-delegate is not a gate. Refuse reasons: loop cap, CONFLICTING, missing `### Loop counters`. Empty Agent is not a refuse. Nicklas can still move Merging. Land still merges only to `development`. ADR-0025 gets a supersession note (or ADR-0028 records the new Auto-merge ownership rule).
- **Leftover Pi:** Done and Canceled still clear delegate if set. Claim does not set it. Historic Implementing issues with Pi may keep it until Done; implement must not skip them.
- **AgentSession removed:** no `/webhooks/linear/agent-session` factory path (404 or omit). No ACK thought/action/elicitation. No mapping of Pi JSON stdout to Linear activities. `created` / `prompted` cannot enqueue (there is no session path). Issue HMAC remains the only Linear webhook.
- **Secrets:** remove session/actor names from required worker boot and from `host.md` / `.env.example` as required: `LINEAR_PI_WEBHOOK_SECRET`, `LINEAR_PI_ACCESS_TOKEN`, `LINEAR_PI_CLIENT_ID`, `LINEAR_PI_CLIENT_SECRET`, `LINEAR_PI_APP_USER_ID`. Keep `LINEAR_CLI_API_KEY`, `LINEAR_WEBHOOK_SECRET`, `GH_TOKEN`, `OPENROUTER_API_KEY`, `CURSOR_API_KEY`. Names only; no values in git.
- **Role comments:** one new top-level issue comment per transition, not per tool call:
  - planner: claimed (or skip Cursor / write-scope overlap — already comments)
  - implement → In Review: PR URL + short what-was-built
  - checker fail: short “returned to Implementing” (findings stay in workpad `### Review feedback`)
  - checker pass: per-criterion verdict
  - Auto-merge: flipped to Merging, or refused with reason
  - land: merge SHA, or merge error
- **Workpad:** still exactly one `## Agent Workpad` comment, edited in place. Creating a second workpad is a miss. Capacity-gate in-place comment stays as today.
- **Description AC (checker pass):** parse the issue body’s Acceptance criteria checkboxes. Tick `[x]` for each criterion the pass stands behind. Unmet → not a pass (existing Spec axis). If the contract changed, rewrite that bullet in the description and say why in the pass comment. Do not tick silently. Workpad AC may stay in sync; the **description** is the lock Nicklas reads.
- **Locks:** `CONTEXT.md` orchestration (Agent empty; avoid new comment *per tool/thought*, allow one comment per role transition; Auto-merge without Pi). `WORKFLOW.md`, `docs/agents/automations.md`, `.cursor/agents/planner.md` / checker, generate-harness-docs. `factory.config.json` keeps `requireDelegate: false` and `delegateAgentName: Cursor` as the skip name only.
- **Clients:** no edits to `apps/mobile`, `apps/web`, `apps/admin`, or `packages/db`.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Linear GraphQL live, a live `pi` session, or Chromium.

**Good test:** given fake Linear / `gh` / spawn, assert enqueue role, claim mutation shape, status, comment bodies, description checkbox text. Do not mock the module graph.

**Seam (one):** the worker job lifecycle named above. `/tdd` will not re-quiz it.

Adapters behind the seam (not the test surface): real Linear CLI, real `pi`, real GitHub. Tests inject fakes. Planner, webhook-router, checker-exit, auto-merge, land, resume, and compose-worker tests already exist.

**Prior art:** `harness/tests/planner.test.mjs`, `webhook-router` / `agent-session.test.mjs`, `checker.test.mjs`, `auto-merge.test.mjs`, `resume.test.mjs`, `compose-worker.test.mjs`, `implement-adw.test.mjs`. Extend those files. Delete or invert AgentSession tests that required a display-only ACK. Do not spawn a model. Do not set Linear Agent to Cursor.

Required cases at that seam:

- Planner claim of eligible Backlog issue → Implementing, claim input has no `delegateId`, Agent empty, one claim comment.
- Planner sees Cursor delegate → skip, comment, status unchanged.
- `dispatchIssue` Implementing with `delegate: null` + Feature type → enqueue implement.
- `dispatchIssue` Implementing with Cursor delegate → skip.
- Resume poller enqueues Implementing with empty delegate.
- Auto-merge Ready for merge, MERGEABLE, green checks, counters under cap, empty delegate → Merging, one comment.
- Auto-merge loop cap or CONFLICTING → stay Ready for merge, comment, no requirement that delegate was Pi.
- Issue HMAC still enqueues factory roles; a request to the old session path does not enqueue and is not a 200 ACK that posts activities.
- Checker pass → description Acceptance criteria become `[x]`, one verdict comment, status Ready for merge, still a single workpad.
- Checker pass with a rewritten criterion → description text changed, comment argues why, that line is ticked only if the new text is met.
- Checker fail → Implementing, Review feedback complete, one short comment, no description ticks.
- Implement-exit does not create a second workpad comment when one exists.
- Worker boot env does not require `LINEAR_PI_APP_USER_ID` or session/actor token names.
- Done/Canceled still clears a leftover Pi delegate if present.

## Out of Scope

- Linear Assignee → Agents → Cursor as dispatch (already forbidden).
- Replacing Pi with another Linear Agent product.
- Keeping AgentSession as optional decoration.
- Compose replicas, a second harness host, or changing Implement/Finisher slot counts.
- Product MCP on the worker (Coolify, `kc_seed_mcp`).
- `DATABASE_URL` on kit-harness.
- Changing Intake promote rules, loop-cap numbers, write-scope overlap skip, or Capacity gate wait behaviour.
- Staging or production promotion from land.
- Product Expo, Astro, Admin SPA, Seed ingest, Nest `/v1`.
- Inventing Linear issues from this skill.
- Worker memory (sibling milestone).

## Linear

- **Project:** Factory leftovers
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one increment the factory can demo on `development`):
  1. Status dispatch, no AgentSession — Complete when Linear Agent stays empty (never Pi, skip Cursor), AgentSession UI and session HMAC are gone, implement wakes on Implementing, Auto-merge no longer requires Pi delegate, each role writes one issue comment, and checker pass ticks Acceptance criteria in the issue description (or comments why a line changed). Demoable: fake planner claim has no delegateId; Implementing without Pi still enqueues implement; session created does not exist as a factory path; checker pass updates description checkboxes. Ready to promote later when Nicklas wants — land still only merges to `development`.

## Further Notes

- Glossary: Dispatch, Workpad, Auto-merge, Role comment, Description AC — `CONTEXT.md` after generate-harness-docs.
- ADR-0025 superseded in the Auto-merge-vs-Pi-delegate part; Cursor skip stays.
- Research parent: `.scratch/Research/linear-cursor-runtime.md`.
- Linear document: https://linear.app/kitcollective/document/status-dispatch-no-agentsession-0ec0fc765f01
- Next slash: `/to-tickets`. Do not invent issues from this skill.
