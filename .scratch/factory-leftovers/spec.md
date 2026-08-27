# Factory leftovers

Kickoff spec. Linear project **Factory leftovers**. Domain nouns: `CONTEXT.md`. Lanes: `development` / `staging` / `production`. This effort closes the open `signal-up` findings agents filed because write-scope forbade fixing them in-slice. It is not a KitCollective product surface and not a new Seed ingest path.

**Inventory (2026-08-25):** fifteen issues labelled `signal-up`. Thirteen are still open. Two are closed and stay closed. KIT-67 already has its own feature spec and ADR — this kickoff does not re-spec it.

| Issue | Status | Home today | Fate in this spec |
| --- | --- | --- | --- |
| KIT-69 Persist kit-harness Pi Bot Agent hotfixes | Parked | PI | In scope — milestone Harness box in git |
| KIT-70 Stream Pi job events into AgentSession | Parked | PI | In scope — same milestone, after persist |
| KIT-65 / KIT-66 / KIT-63 / KIT-62 CI graph gaps | Backlog / Parked | PI | In scope — one milestone; the four issues are one class |
| KIT-60 orchestration.mdc land approval | Backlog | PI | In scope — Factory locks |
| KIT-61 factory.config.example.json Merging | Backlog | PI | In scope — Factory locks |
| KIT-64 Align factory runtime docs with PI worker | Backlog | PI | In scope — Factory locks |
| KIT-45 resetDatabase has no test/localhost guard | Backlog | KitCollective Seed | In scope — Shared catalog safety |
| KIT-28 Seed proxy fetch has no injectable seam | Backlog | KitCollective Seed | In scope — Seed seams |
| KIT-36 setup-coolify-mcp.sh still writes id `seed` | Backlog | (no project) | In scope — Seed seams |
| KIT-67 Hy3 Scout and Gate | Parked | PI / Worker | **Sibling.** Spec: `.scratch/hy3-scout-gate/spec.md`. ADR-0021. Next slash there is `/to-tickets`, not this kickoff. |
| KIT-18 Register Coolify MCP in Dashboard | Done | KitCollective Seed | Closed — do not reopen |
| KIT-11 CX33 is Helsinki not Nürnberg | Canceled | KitCollective | Closed — do not reopen |

`/to-tickets` creates new vertical-slice issues on **this** project. After those exist, the origin `signal-up` issues become Duplicate of the new slices (or Canceled if the slice already covers them). Do not leave both dispatchable.

## Problem Statement

Nicklas has a board full of `signal-up` leftovers. Agents found real bugs and debt during implement — a next Compose deploy will wipe box-only Pi Bot Agent hotfixes, `pnpm test` on a Cloud Agent VM can DROP the shared development Postgres, factory `node --test` files never fail GitHub, and factory locks still say Cloud Agents are the runtime — but none of those findings are shaped as dispatchable slices. Several tickets describe the same CI gap. Linear’s exclusive Triage group blocked `needs-triage` next to `signal-up`, so they sat untriaged. Closed findings (Coolify Dashboard MCP, Helsinki host lock) should stay closed.

## Solution

One Linear project groups the open leftovers into five staging increments: stop tests wiping the shared catalog; persist kit-harness hotfixes in git and then stream Pi events into the display-only AgentSession; put harness and factory-script tests on the required GitHub `test` job; make factory locks match Merging + the PI worker CLI; give Seed proxy an injectable fetch seam and stop the Coolify MCP generator writing the old server id `seed`. Duplicate CI tickets collapse. Hy3 stays on its existing PI spec. Nicklas still moves Merging; land still sets Done only after the PR is on `development`.

## User Stories

1. As Nicklas, I want every open `signal-up` finding either in this spec or explicitly closed/sibling, so that nothing sits in Backlog without a home.
2. As Nicklas, I want KIT-18 and KIT-11 to stay Done/Canceled, so that this sweep does not reopen finished work.
3. As Nicklas, I want KIT-67 left on the Hy3 Scout and Gate spec, so that OpenRouter routing is not re-litigated here.
4. As Nicklas, I want `/to-tickets` to spawn new slices on this project, so that origin `signal-up` issues are not double-dispatched.
5. As Nicklas, I want origin `signal-up` issues marked Duplicate (or Canceled) after the new slices exist, so that planner cannot claim both.
6. As a Cloud Agent, I want `resetDatabase` to refuse the shared development Postgres, so that `pnpm test` cannot DROP `public` on CX33 (ADR-0008).
7. As a local Cursor session, I want the same refusal when `DATABASE_URL` points at development, so that a laptop with the lane URL cannot wipe the catalog either.
8. As CI, I want `resetDatabase` still to run against the disposable `kit_test` service container, so that schema tests stay hermetic.
9. As `resetDatabase`, I want to allow only localhost / `127.0.0.1` hosts or a database name that matches `*test*` / `*_test`, so that the allowlist is the reverse of `block-seed-substitute-db.sh`.
10. As Nicklas, I want a thrown error (not a silent skip) when the URL is refused, so that a mis-pointed test fails closed instead of passing against the wrong database.
11. As the db module, I want that guard inside `resetDatabase` itself, so that every existing caller is protected without editing every test file first.
12. As error-ratcheting, I want a command-hook that denies `pnpm test` / vitest against a non-test-looking `DATABASE_URL` for packages that call `resetDatabase`, so that the class cannot recur by adding a new unguarded caller.
13. As that hook, I want CI’s `kit_test` URL still allowed, so that the required GitHub job does not go red.
14. As Seed proof runs, I want `block-seed-substitute-db.sh` unchanged in direction, so that development seed still must hit the real CX33 database.
15. As kit-harness, I want Agent activity mutations to use an `actor=app` token (`LINEAR_PI_ACCESS_TOKEN` or equivalent), so that a personal `lin_api_` key cannot 500 the session ACK.
16. As kit-harness, I want a 401 on that app token to mint again via `client_credentials`, so that the documented 30-day expiry does not leave Pi Bot Agent “didn’t start”.
17. As git, I want token **names** in `.env.example` only, so that values stay on the box.
18. As the webhook router, I want the delegate gate to accept **Pi Bot Agent** and/or `LINEAR_PI_APP_USER_ID`, so that exact `"Pi"` no longer skips implement.
19. As tests, I want that real display name covered, so that a later rename is a failing test not a silent skip.
20. As worktree checkout, I want HTTPS git auth via Basic `x-access-token` extraHeader, so that `git clone --bare` does not prompt for a GitHub username.
21. As tests, I want that header shape asserted without printing the token.
22. As implement checkout, I want the start-point to be `refs/heads/<lane>` on the bare mirror (or a fetch that creates `refs/remotes/origin/<lane>`), so that `worktree add … origin/development` is not an invalid object name.
23. As Nicklas, I want the next `docker compose up -d --build` from `origin/development` to keep AgentSession ACK and implement checkout working, so that box-only patches cannot vanish.
24. As Nicklas, I want live AgentSession activities (`thought` / `action`) derived from the Pi child while implement or factory-checker runs, so that the stream is not empty copy plus one ephemeral Implementing line.
25. As the factory, I want session `created` and `prompted` still not to enqueue a coding job, so that only the Issue status webhook spawns a role.
26. As Nicklas, I want the prompt box on a display-only session to no-op (or be documented HITL-only), so that “Tell Pi Bot Agent what to do next” does not start a second Pi job.
27. As the workpad, I want to remain durable evidence, so that ephemeral tool lines do not replace `### Validation` / `### Evidence`.
28. As the Issue webhook, I want stream-path failures not to 500 or miss the ≤10s ACK, so that a Linear activity outage cannot block enqueue.
29. As tests, I want a fake Linear client and a fake Pi event fixture, so that CI never spawns a model.
30. As Linear Agent, I want to stay empty (not Cursor), so that this work does not start a Cloud Agent.
31. As CI, I want `node --test harness/tests/*.test.mjs` on the required `test` job, so that planner, implement ADW, checker, land, compose-worker, and AgentSession regressions fail GitHub.
32. As CI, I want `scripts/tests/webhook-router.test.mjs` on that same job, so that HMAC dispatch tests are not hand-only.
33. As CI, I want `scripts/tests/land-policy.test.mjs` on that same job, so that Merging-vs-Done policy cannot regress unnoticed.
34. As Nicklas, I want KIT-62, KIT-63, KIT-65, and KIT-66 treated as one slice, so that four PRs do not wire the same `ci.yml` step.
35. As a failing harness test, I want the required GitHub check red, so that checker cannot pass a PR that skipped the worker graph.
36. As `pnpm test` (turbo), I want an equivalent workspace or script entry if that is how CI stays one graph, so that local full-test and GitHub do not diverge.
37. As existing mobile `check-*.test.mjs` steps, I want them kept, so that this increment does not drop Expo evidence checks.
38. As Nicklas, I want `.cursor/rules/orchestration.mdc` to say he moves to **Merging** as merge permission, so that the always-applied rule matches land policy (KIT-51).
39. As land, I still want Done only after `gh pr merge` onto `development`, so that status is not a synonym for merge.
40. As land, I still must not push to `staging` or `production` from an issue land run.
41. As a new factory repo, I want `factory.config.example.json` `states` to include Merging (`started`) between Ready for merge and Done, so that bootstrap does not copy a board without merge permission.
42. As factory locks, I want `CONTEXT.md` (generated orchestration block), `WORKFLOW.md`, and `docs/agents/automations.md` to describe the PI worker as Compose + `gh` + Linear CLI, so that agents stop treating Cursor Cloud Agents as the dispatch runtime.
43. As those locks, I want Linear MCP described as not installed on kit-harness (empty `.pi/mcp.json`), so that workers do not wait on Linear MCP.
44. As product MCP, I want Coolify MCP and `kc_seed_mcp` still documented as Desktop / Cloud Agent wiring, so that the PI-worker CLI lock does not delete Seed chat.
45. As generate-harness-docs, I want the generated orchestration block regenerated after lock edits, so that `AGENTS.md` / `CONTEXT.md` do not drift by hand.
46. As the signal-up skill, I want the exclusive Triage label group resolved: either the skill requires only `signal-up`, or the group is split so `needs-triage` can coexist, so that future findings are not filed “wrong” in Linear.
47. As Nicklas, I do not want a dummy issue created just to hang a `kickoff` label — that label lives on issues `/to-tickets` may spawn later.
48. As Seed tests, I want `createProxyFetchHtml` / `createSeedHttpFetch` to accept an injected fetch (and proxy-agent factory), so that behaviour is asserted at a contract instead of `vi.mock("undici")`.
49. As those modules, I want the `undici` implementation as the default argument, so that production callers do not change.
50. As KIT-21, I want fail-closed missing-proxy behaviour still covered, so that Coolify still refuses Transfermarkt without the Seed proxy.
51. As KIT-21, I want the proxy URL still used when required, so that injection does not skip the agent.
52. As oxlint, I want `anti-slop/no-module-mocking` raised from `warn` to `error`, so that the vendored rule becomes a real gate.
53. As error-ratcheting, I want the corresponding ratchet-target entry removed from `docs/agents/error-ratcheting.md` only after those two tests no longer mock `undici`.
54. As the repo, I want no `vi.mock("undici")` left, so that the class is gone rather than silenced.
55. As Cloud Agent install, I want `scripts/setup-coolify-mcp.sh` to write server id `kc_seed_mcp` (not `seed`), so that generated `mcp.json` matches `.cursor/mcp.json.example`.
56. As that generator, I want Seed env names to include Seed proxy, FK, and lane R2 names, so that a generated server can actually run `seed_apify` / `seed_fk`.
57. As that generator, I want no Coolify token keys on the Seed server, so that `kc_seed_mcp` stays Seed-only (CONTEXT.md).
58. As that generator, I want Coolify to remain a separate `coolify` server in the same file.
59. As FetchAdapter, I want the injection pattern already used in `resolve-fetch-adapter` copied, so that Seed does not grow a second seam language.
60. As `/tdd`, I want existing harness, db, and seed-proxy tests extended, so that this kickoff does not invent a new test graph.
61. As Expo / Astro / Admin SPA, I want this effort not to change collector Save, Catalog peek chrome, or Staff access, so that product UI stays on their own projects.
62. As Nest `/v1`, I want no new seed HTTP and no Transfermarkt fetch, so that ADR-0003 stays locked.
63. As Nicklas, I want each milestone demoable on `development` before promotion to `staging`, so that leftovers promote as handfuls, not one dump.
64. As planner, I want new slices labelled `ready-for-agent` only after a human triages them off this spec, so that `signal-up` never auto-dispatches.

## Implementation Decisions

- **Linear:** Kickoff. One new project **Factory leftovers** on team KIT. Lead Nicklas. Craft label `craft:backend` only (harness, CI, db, seed scripts — no product UI). No product apps in write-scope of the later slices unless a ticket explicitly says otherwise.
- **Not a fourth product:** KitCollective / KitCollective Seed / PI remain the product and harness boards. This project is the planning home for leftover findings that those boards could not absorb in-slice. Origin issues stay related; they are not the dispatch tickets.
- **KIT-67:** Out of this project’s implementation. Feature spec and ADR-0021 already exist on PI milestone Worker.
- **Closed issues:** KIT-18 and KIT-11 are not slices.
- **Collapse:** KIT-62, KIT-63, KIT-65, KIT-66 are one CI-graph slice. KIT-65’s file list is the union.
- **Modules:** (1) `resetDatabase` in the db package — guard at the public function. (2) Worker harness — linear-cli activity auth, webhook-router delegate gate, worktree git env and checkout start-point, session-adapter activities, pi-job stdio. (3) Required GitHub `test` job plus any root script that lists `node --test` files. (4) Factory locks — `factory.config.example.json`, `orchestration.mdc`, generated orchestration docs, `WORKFLOW.md`, automations doc, signal-up skill vs Triage group. (5) Seed `proxy-config` in apify and fkapi (same injection shape), oxlint ratchet, Coolify mcp.json generator.
- **resetDatabase allowlist:** host `localhost` or `127.0.0.1`, or database name matching `*test*` / `*_test`. Refuse otherwise. Mirror the substitute detection in `block-seed-substitute-db.sh` but inverted. Do not weaken that seed ratchet.
- **Optional hook:** a new command-hook denying test runs against a non-test `DATABASE_URL` is in scope for the catalog-safety increment (KIT-45 suggested it). Tighten-only.
- **Pi token:** app-user `client_credentials` token for `createAgentActivity`. Personal `lin_api_` is not an actor for that mutation. 30-day refresh is documented; values never committed.
- **Delegates:** accept installed app display name **Pi Bot Agent** and/or app user id. Keep `"Pi"` if it still appears. Tests cover the production name.
- **Git HTTPS:** Basic extraHeader `x-access-token:$GH_TOKEN`. Token in env/config, not argv.
- **Bare mirror:** checkout from `refs/heads/<lanes.integration>` (or equivalent remote-tracking ref created by fetch). Fixture uses a bare clone, not GitHub.
- **AgentSession stream:** derive `thought` / `action` from Pi child events. Display-only ACK from KIT-59 stays: no spawn from session created/prompted. Stream failures must not fail the Issue webhook ACK. Workpad remains durable.
- **CI:** add the missing `node --test` invocations to the same required job that already runs `scripts/tests/check-*.test.mjs` and `pnpm test`. Do not drop those steps.
- **Locks:** Merging is merge permission; Done is merged to `development`. PI runtime on the box is CLI (`gh` + Linear CLI), not Linear MCP and not Cloud Agents as dispatch. Product Coolify / `kc_seed_mcp` remain Desktop/cloud-agent MCP. Regenerate harness docs after generated-block edits.
- **Triage group:** resolve the skill vs exclusive-group contradiction in the locks increment. Prefer updating the skill and `docs/agents/signal-up.md` to `signal-up` only if splitting the Linear group is human-only in the workspace UI.
- **Seed proxy:** inject fetch / proxy-agent factory; `undici` default. Copy FetchAdapter injection. Then raise `anti-slop/no-module-mocking` to `error` and drop the ratchet-target note.
- **MCP generator:** emit `kc_seed_mcp` with the same Seed-only env **names** as `.cursor/mcp.json.example`. Coolify server stays separate. No Coolify tokens on the Seed server.
- **Secrets:** names only in git. No production secrets in development.
- **Clients:** `apps/mobile`, `apps/web`, `apps/admin` must not import `apps/api` or `packages/db`. This effort does not change those apps except if a later ticket’s write-scope explicitly includes a generator script they consume.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Pi TUI internals, live Linear GraphQL, live `pi` sessions, Transfermarkt, or GitHub’s UI.

**Good test:** given a fake dependency (URL, spawn, filesystem, fetch), assert the module refuses, accepts, writes, or dispatches the behaviour a caller would see. Do not mock the module graph (`vi.mock` of `undici` is the bug this spec removes).

This kickoff uses **four existing seams** — not a new fifth. `/tdd` will not re-quiz them.

1. **`resetDatabase` (db package public function)** — catalog safety. Callers and tests pass a connection string. Assert: localhost/`kit_test`-shaped URLs still reset; a CX33-looking URL throws before DROP. Prior art: `packages/db` schema tests. Do not require a live development database in CI.

2. **Worker harness job / webhook / session-adapter (existing KIT-52–59 tests)** — persist hotfixes and AgentSession stream. Fake Linear, fake Pi stdio/events, fake git. Assert: activity mutations would use the app-token env name; delegate gate accepts Pi Bot Agent; git extraHeader is Basic `x-access-token`; worktree start-point works on a bare fixture; stream maps child events to activities; created/prompted still do not enqueue; stream errors do not fail ACK. Prior art: `harness/tests/*.test.mjs`. Do not spawn a model. Do not set Linear Agent to Cursor.

3. **Required GitHub `test` job graph** — factory tests on CI. Highest interface: the workflow (and any root script it calls) must invoke the named `node --test` files. Prior art: `scripts/tests/check-*.test.mjs` that grep workflow/lock files. A good test fails if `ci.yml` omits `harness/tests` or `webhook-router` / `land-policy`. Do not require a red GitHub check in the PR to prove the wiring — the check-script is the seam.

4. **Seed `proxy-config` + mcp.json generator** — Seed seams. Injected fetch at `createProxyFetchHtml` / `createSeedHttpFetch` (FetchAdapter injection is the precedent). Generator: run the script (or its jq payload builder) against env fixtures and assert server id `kc_seed_mcp`, Seed env names, separate `coolify`, no Coolify token keys on Seed. Prior art: `seed/*/tests/seed-proxy.test.ts`, KIT-32 example catalog. After injection, those tests must not `vi.mock("undici")`.

**Factory locks** (Merging in example config, orchestration.mdc wording, generated CONTEXT block, signal-up skill) are asserted with the same class of check-scripts as (3), not a second product seam. If a lock is prose-only, a targeted file-content test is enough — do not snapshot all of `CONTEXT.md`.

**Adapters behind seams (not the test surface):** real Postgres vs refused URL; real `pi` vs fake spawn; real undici vs injected fetch; real Coolify vs fixture env.

**Do not add a seam** for Linear MCP on the worker, for a second Pi process, for Nest seed HTTP, or for Cloud Agent Dashboard registration (KIT-18 is Done).

## Out of Scope

- KIT-67 Hy3 Scout and Gate (existing spec + ADR-0021; `/to-tickets` on PI).
- Reopening KIT-18 (Dashboard Coolify MCP) or KIT-11 (Helsinki host lock).
- Changing `PI_MODEL` / implement ADW / factory-checker as a second process (already green on PI).
- Product Expo, Astro, Admin SPA, Staff access, Take-down, Vision, collector photos.
- New Seed ingest paths, Decodo vendors, fusing `seed_apify` and `seed_fk`.
- Nest fetching Transfermarkt or FK.
- Landing or promoting to `staging` / `production` from an issue run.
- Splitting Linear’s Triage group in the workspace UI if that is human-only — then the skill/docs change is the slice.
- Applying `ready-for-agent` to leftover `signal-up` issues in this skill.
- Creating Linear issues from this skill.

## Linear

- **Project:** Factory leftovers
- **Mode:** kickoff
- **Craft labels:** `craft:backend`
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. **Shared catalog safety** — Complete when `resetDatabase` refuses a non-test, non-localhost `DATABASE_URL` (throws, no DROP), CI `kit_test` still resets, and the optional test-run hook does not fire on the required GitHub job. Demoable: a unit test with a CX33-shaped URL fails closed; `pnpm test` in CI stays green. Ready to promote integration → staging when that guard is on `development`.
  2. **Harness box in git** — Complete when kit-harness hotfixes live in git (app token for activities, Pi Bot Agent delegate, Basic git header, bare-mirror start-point) and the display-only AgentSession streams Pi `thought`/`action` without enqueueing from created/prompted. Demoable: `docker compose up --build` from `origin/development` ACKs the session; implement checkout works; stream activities appear; workpad remains durable. Ready to promote when that box rebuild is the git tree, not ops patches.
  3. **Factory tests on CI** — Complete when the required `test` job runs `harness/tests/*.test.mjs`, `scripts/tests/webhook-router.test.mjs`, and `scripts/tests/land-policy.test.mjs` (union of KIT-62/63/65/66) and a failure fails the check. Existing mobile check-scripts remain. Demoable: CI logs show those files; a check-script fails if they are omitted. Ready to promote when GitHub is the source of truth for harness regressions.
  4. **Factory locks match PI** — Complete when `orchestration.mdc` treats Merging as merge approval, `factory.config.example.json` includes Merging, runtime docs describe PI as CLI (not Cloud Agents / Linear MCP on the box), generated harness docs match, and the signal-up vs exclusive Triage group contradiction is resolved in skill/docs (or noted as human-only group split). Demoable: a copied example config still has Merging; an agent reading locks would not dispatch via Cloud Agents. Ready to promote when locks and example config agree with KIT-51 / KIT-53.
  5. **Seed seams** — Complete when proxy-config in apify and fkapi takes an injected fetch (undici default), seed-proxy tests have no `vi.mock("undici")`, `anti-slop/no-module-mocking` is `error`, the ratchet-target note is gone, and `setup-coolify-mcp.sh` writes `kc_seed_mcp` with Seed-only env names plus a separate Coolify server. Demoable: seed-proxy tests pass; generated mcp.json matches the example catalog ids. Ready to promote when Cloud Agent install cannot resurrect server id `seed`.

## Further Notes

- Glossary: Kit, Seed run, kc_seed_mcp, Seed proxy, Lane, Implement parent, Scout, Gate, Workpad, Signal-up, Land, Merging — `CONTEXT.md`.
- ADR-0008 (shared development Postgres), ADR-0004 (product vs seed Linear projects — this kickoff does not merge those boards), ADR-0021 (Hy3, sibling).
- Origin findings: KIT-45, KIT-69, KIT-70, KIT-62, KIT-63, KIT-65, KIT-66, KIT-60, KIT-61, KIT-64, KIT-28, KIT-36.
- Sibling: [Hy3 Scout and Gate](https://linear.app/kitcollective/document/hy3-scout-and-gate-f762d85e11f3).
- Linear document: https://linear.app/kitcollective/document/factory-leftovers-a3bab741cad0
- Linear project: https://linear.app/kitcollective/project/factory-leftovers-32e60ff017a8
- Next slash: `/to-tickets`. Do not invent issues from this skill. After tickets exist, mark origin `signal-up` issues Duplicate/Canceled so planner sees one dispatchable slice per finding.
