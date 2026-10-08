# Software Factory

## Problem Statement

KitCollective’s factory used a Pi-based harness embedded in the product monorepo. That coupled product CI, write-scope, and deploy to the worker, made multi-project reuse impossible, and left Linear/GitHub/session control fragile (including Agent Session vs real dispatch). Pi is archived; the live worker box is empty. We need a **private, multi-tenant Software Factory** that runs **Cursor CLI/SDK** IssueSessions with durable logging, model routing, GitHub orchestration, and Linear control-plane parity—without dragging product domain skills into the harness repo, and without burning tokens while waiting on CI or humans.

## Solution

Build **Software Factory** in private repo `KitCollective/kit-factory`, deployed on `kit-harness`, with KitCollective as tenant #1. Linear remains the control plane (webhook + resume poller). Each eligible issue gets an **IssueSession** (container slot + Cursor `agentId` + Factory DB row). **Linear Agent Session** is display-only. While waiting on GitHub checks or humans, the session stays in **cheap hold** (no model loop). Memory is three-layer (factory-lessons, CodeGraph + DB metadata, session ephemeral). **Factory toolchain** (lane agents, Land package, orchestration skills) lives canonically in `kit-factory` and is consumed identically locally and in sessions; product-domain skills stay in the product repo.

## User Stories

1. As Nicklas, I want a Linear project named Software Factory, so that factory work is not mixed into KitCollective product boards.
2. As Nicklas, I want `kit-factory` private under KitCollective, so that harness IP and ops stay closed.
3. As a factory operator, I want one worker process serving many tenants by `tenantId`, so that we do not run a Compose stack per product in v1.
4. As a factory operator, I want a pre-tenant Factory DB schema before the first tenant row, so that host/worker events log correctly.
5. As a factory operator, I want tenant config split (product `factory.config.json` + factory binding), so that Linear state maps are not duplicated blindly.
6. As the Wake router, I want Linear webhooks to acquire or resume IssueSessions, so that status/`ready-for-agent` wakes work without Cloud Agent dispatch.
7. As the Wake router, I want a resume poller after Compose reboot, so that Implementing issues are not stranded.
8. As the Wake router, I want AgentSession webhook events never to enqueue coding, so that display traffic cannot start jobs.
9. As an IssueSession, I want a dedicated container slot from acquire through Retro, so that parallel issues do not share worktrees.
10. As an IssueSession, I want Cursor SDK `Agent.create` / `send` / `resume` with persisted `agentId`, so that coding continues across process boundaries.
11. As an IssueSession, I want explicit `local: { cwd }` against the session worktree on kit-harness, so that we do not silently get the wrong runtime.
12. As an IssueSession, I want model id passed per role/gate (and sticky on send), so that Scout/Builder/Checker cost profiles stay intentional.
13. As an IssueSession, I want `Cursor.models.list()` used when validating model ids, so that hard-coded exotic ids do not fail in production.
14. As an IssueSession, I want `run.stream()` events mirrored to Linear Agent Session (thought/action/response), so that humans see progress without granting dispatch to Agent Session.
15. As an IssueSession, I want `run.usage` / `Agent.getUsage()` written into Factory DB, so that token cost is auditable per issue and tenant.
16. As an IssueSession, I want `run.cancel()` when supported, so that idle-timeout and human abort stop spend.
17. As an IssueSession, I want startup failures (`CursorAgentError`) distinguished from mid-run `status == error`, so that retries and parking are correct.
18. As an IssueSession, I want agents disposed reliably, so that local executors and stores do not leak on the host.
19. As an IssueSession in cheap hold, I want no `send()` while waiting on GitHub checks or human input, so that the slot stays warm without model burn.
20. As GitHub orchestration, I want `gh` to open/update PRs and wait on required checks inside the factory, so that land does not “hope CI”.
21. As GitHub orchestration, I want merge gates from the shared Land package, so that product and factory do not fork policy.
22. As Auto-merge/land, I want WORKFLOW status transitions preserved (Ready for merge → Merging → Done), so that KitCollective tenants keep the same control plane.
23. As Retro, I want distill after Done and before reap, so that lessons land while the session still exists.
24. As Factory memory A, I want factory-lessons in Factory DB, so that recurring Standards/Slop classes are deterministic—not LLM memory products.
25. As Factory memory B, I want CodeGraph index on disk plus metadata/sync rows in Factory DB, so that sessions mount RO intelligence without SQL-graph invention in v1.
26. As Factory memory C, I want session ephemeral files under `sessions/<issue>/`, so that composition/transcripts die with archive.
27. As Factory toolchain, I want lane agents and Land package canonical in kit-factory, so that one fix updates local Cursor and IssueSessions.
28. As a product developer, I want Kit/Seed/UI skills to stay in kit-collective, so that local product work does not require moving domain docs into factory.
29. As tenant KitCollective, I want dynamic binding (repo, team, lanes, mounts), so that a second product can onboard without forking the worker.
30. As kit-harness, I want deploy under `/opt/kit-factory` (or equivalent), so that product monorepo root is not the worker root.
31. As an operator, I want structured factory logs (wake, phase, gate, usage) separate from raw model transcripts, so that Grafana/Loki-style ops remain possible.
32. As an operator, I want MCP servers for sessions re-passed on `Agent.resume`, so that secrets/config are not assumed persisted by the SDK.
33. As an operator, I want hooks/sandbox options available for shell gating in local agents, so that tool policy is enforceable.
34. As Nicklas, I want Pi kept only as `kit-pi-harness` reference, so that no live path depends on Pi.
35. As `/to-tickets`, I want milestones that are staging increments, so that each milestone is a handful of vertical slices—not a phase label.

## Implementation Decisions

### Repos and layout
- Canonical code: private `KitCollective/kit-factory`.
- Local Cursor multi-root: `kit-collective.code-workspace` (product + factory + Pi archive).
- Product monorepo must not regain a live `harness/` tree.
- Archived Pi behavior is reference-only from `kit-pi-harness`.

### Control plane
- Linear statuses/labels from tenant `factory.config.json` remain source of dispatch truth.
- Wake = webhook + resume poller → `SessionRegistry.acquire|resume`.
- Human assignee; Linear Agent field empty for dispatch.
- Linear Agent Session = display mirror only; inbound AgentSession never enqueues.

### IssueSession lifecycle
- States conceptually: Acquired → Implementing phases → In Review → Ready for merge → Merging → Done → Retro → Archived → slot free.
- Retro is factory-only (not a Linear status).
- Container-per-issue from v1; one worker process multi-tenant via `tenantId`.

### Cursor SDK / CLI (validated against current public SDK docs — public beta)
- Prefer **TypeScript `@cursor/sdk`** in the factory worker (matches existing Node harness culture).
- Integration shape: **`Agent.create` + `send` + `resume`**, not one-shot `Agent.prompt`, for multi-turn IssueSessions.
- **Runtime: local** inside the session container/host worktree (`local.cwd` = checkout). Cloud runtime is out of scope for v1 (harder mounts for CodeGraph/Factory toolchain; different PR UX). Always pass `local` explicitly so the SDK cannot silently default.
- Persist **`agent.agentId`** on the IssueSession row; resume with `Agent.resume(agentId, { local, model, mcpServers })`.
- **Model routing:** factory model-router chooses `{ id }` per gate/role; pass on create/send; re-pass on resume (`agent.model` is undefined after resume unless set). Validate ids via `Cursor.models.list()`. Sticky override on `send({ model })` is acceptable within a role.
- **Observability:** consume `run.stream()` → map to Linear Agent Session + Factory DB event log; persist `run.usage` / `Agent.getUsage()` for cost. Do not treat stream text as durable truth without DB write.
- **Control:** use `run.cancel()` when `supports("cancel")`; always `await run.wait()`; distinguish `CursorAgentError` (never started) vs `result.status === "error"` (started, failed).
- **Cheap hold:** keep container + DB row + agentId; **do not call `send`** during GitHub/human wait. SDK has no special “pause” API—absence of send is the pause.
- **Lifecycle:** `await using` / dispose agents; avoid leaks of local executor/store.
- **MCP:** re-supply inline `mcpServers` on every resume (not persisted). Prefer file-based `.cursor/mcp.json` + settingSources for durable tenant MCP where possible.
- **Safety:** local agents can run tools ungated by default—enable hooks (`beforeShellExecution` / preToolUse) and/or `local.sandboxOptions` as factory policy.
- **Known weaknesses / watch-outs (document in spike milestone):**
  - SDK is **public beta**; APIs can move.
  - **Context headroom / programmatic compact** are weak or missing; long IssueSessions may need factory-owned rollover (new agentId + summarized handoff) when stream signals summarization/usage risk.
  - **Subagent usage** may not roll fully into `run.usage`—verify and supplement with Team Admin usage APIs if needed.
  - **Node vs Bun** local store (SQLite vs JSONL fallback)—pin runtime for kit-factory worker image.
  - Auth: `CURSOR_API_KEY` user or service-account keys; Team Admin keys not supported for SDK runs.
  - Inference is always hosted (local ≠ local model); budget via router + cheap hold.
- OpenRouter (or similar) remains an option **behind the factory model-router** for non-Cursor models if the SDK/account cannot express a gate; spike must prove whether Cursor SDK model list alone covers Hy3-style economy gates or whether a dual path is required. Decision recorded in milestone 2 spike notes—not assumed solved here.

### Factory DB
- Pre-tenant platform tables + tenant-scoped rows (`tenantId`).
- Holds: session registry, run/event log, usage, factory-lessons, CodeGraph metadata/sync (not full graph edges as SQL in v1).

### Memory
- A: factory-lessons (deterministic class→lesson).
- B: CodeGraph on-disk index + DB metadata; RO in sessions.
- C: session ephemeral until Retro/archive.

### GitHub + Land
- Factory orchestrates branch/PR/check wait via `gh`.
- Land package published from factory, consumed by tenants and worker (shared package—not product-only fork).

### Toolchain vs domain skills
- Factory toolchain canonical in kit-factory; dynamic consume locally + in sessions.
- Product domain skills remain in product repos.

### Testing seams (approved)
1. `SessionRegistry` — primary TDD seam  
2. `WakeRouter` — Linear contract (incl. AgentSession non-dispatch)  
3. `CursorSessionPort` — create/resume/stream/usage/cancel/dispose  
4. `GitHubPort` + Land package  
5. `FactoryDb`  
6. `TenantLoader`

## Testing Decisions

- Test **external behavior** at the seams above—not Cursor’s internals and not private helpers.
- Prefer fakes for Linear webhook payloads, `gh`, and Cursor SDK (inject `CursorSessionPort`).
- Prior art: `kit-pi-harness` webhook-router and land-policy tests (behavior port, not Pi runtime).
- Milestone 2 must include an **integration spike** on kit-harness: real `@cursor/sdk` local agent against a throwaway repo—prove resume, stream→log, usage rows, cancel, cheap hold (wait without send), and model list/routing. Spike notes become ADR or spec appendix if APIs force a design change.
- Good tests: given Wake payload X, registry reaches state Y; AgentSession created does not acquire; cheap hold duration does not invoke `send`; usage upsert has tenantId+issueId+runId.

## Out of Scope

- Reviving Pi as live runtime.
- Cursor Cloud Agent / Linear Agent field as factory dispatch.
- Cloud Cursor SDK runtime as default IssueSession executor (v1).
- Moving Kit/Seed/UI product domain skills into kit-factory.
- Full SQL-normalized CodeGraph (nodes/edges tables) in v1.
- Linear status named Retro.
- Billing multi-org customers (tenant ≠ customer yet).
- Replacing KitCollective product WORKFLOW states.
- Publishing this effort’s implementation tickets (that is `/to-tickets`).

## Linear

- **Project:** Software Factory
- **Mode:** kickoff
- **Craft labels:** `craft:backend`
- **Lead:** Nicklas
- **Priority:** None
- **Milestones** (each = one staging increment):
  1. **Host + Factory DB** — Worker deploys on kit-harness with pre-tenant schema, tenant row for KitCollective, structured event log; demo: insert/read session row + pre-tenant host event without Cursor.
  2. **IssueSession + Cursor SDK spike** — acquire container, local Agent create/send/resume, stream logged, usage stored, cancel + cheap hold proven; AgentSession display path stubbed; demo: one fake issue run with resume after process restart.
  3. **Memory A + B** — factory-lessons CRUD + CodeGraph sync/mount + DB metadata; demo: session sees RO graph + ranked lessons without rebuild.
  4. **Retro + archive** — Done → distill → archive tarball → release slot; demo: lesson written and slot free.
  5. **Wake + GitHub + Land + KitCollective tenant** — webhook/poller, PR/check wait, Land package consumed by factory and kit-collective, lane agents from factory toolchain; demo: real KIT issue path to Ready for merge without Pi.
  6. **Multi-tenant harden** — isolation tests, second tenant dry-run config, usage/tenant scoping audit; demo: two tenantIds cannot read each other’s sessions/lessons.

## Further Notes

- Glossary: `kit-factory/CONTEXT.md`.
- Grill progress: `kit-factory/docs/grill-progress.md`.
- Design intent also in `~/.cursor/plans/issue_session_sandbox_5a1105c8.plan.md` and `.scratch/cursor-factory-sandbox/research.md`.
- Cursor SDK docs: https://cursor.com/docs/sdk/typescript (public beta). Re-check model list and usage APIs at spike time.
- Consumption mechanism for Factory toolchain into product/local (package vs submodule vs sync) is an implementation choice inside milestones 5—constraint is **same revision** in IDE and IssueSession.
