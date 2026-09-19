# Linear Cursor agent vs Cursor Automations

**Date:** 2026-08-17  
**Product:** KitCollective  
**Question:** Should the factory delegate *and execute* via Linear’s native Cursor agent (Assignee → Agents → Cursor), or keep Cursor Automations? Can the factory’s per-role instructions (planner / implement / checker / land / domain helpers) be attached to Linear-started Cloud Agents?

This file is a source inventory. It does not change `factory.config.json` or Linear.

Parent: `WORKFLOW.md` · `docs/agents/automations.md` · observed KIT-7 session 2026-08-17.

---

## Direct answers

1. **Linear delegate to Cursor always starts a Cloud Agent.** There is no documented “flag only” mode. Linear: assigning/delegating to an agent *triggers the agent to take action based on its programmed behavior* ([AI Agents](https://linear.app/docs/agents-in-linear)). Cursor: assignee field → select Cursor ([Linear integration](https://cursor.com/docs/integrations/linear)). Linear marketplace: *Once assigned, Cursor automatically spins up a cloud agent* ([Cursor Integration](https://linear.app/integrations/cursor)). KitCollective observed this on KIT-7: delegate → “Cursor started by Nicklas… Examining issue KIT-7”.

2. **That path is a single generic coding agent**, not planner/implement/checker/land. Cursor documents one workflow: analyze the issue, filter non-dev work, create a PR when complete ([Linear integration](https://cursor.com/docs/integrations/linear)). Official config knobs are **repo / branch / model** only (`[key=value]`, labels). There is no official setting for a custom system prompt on Linear-delegate.

3. **Per-role custom instructions belong on Cursor Automations**, not on Linear-delegate. Automations: choose trigger, **write a prompt**, choose tools, choose repo ([Automations](https://cursor.com/docs/cloud-agent/automations)). Linear triggers are **Issue created / Status changed / End of cycle** — not delegate. That is why this factory’s planner is a cron and implement/checker/land wake on **status** (`docs/agents/automations.md`).

4. **Best for this factory: keep Automations as the runtime. Do not use Assignee → Cursor as dispatch.** Linear-delegate fights `blockedBy`, one-issue-one-PR, checker-before-merge, and “approver moves to Done”. It also cannot be the quiet eligibility flag `requireDelegate` assumed.

---

## Two products that share the word “Cursor”

| Surface | What it is | Starts work? | Custom prompt? |
| --- | --- | --- | --- |
| **Linear Agent** (Settings → AI & Agents) | Linear’s built-in agent (`@Linear`, chat, Loops) | Workspace toggle | Linear skills / guidance ([Linear Agent](https://linear.app/docs/linear-agent)) |
| **Cursor in Assignee → Agents** | Third-party app user installed from Cursor dashboard | **Yes, immediately** | Hardcoded Linear-integration prompt + optional `AGENTS.md` from the clone |
| **Linear “Work on issue”** (`W` then `O`) | Open the issue in a coding tool locally | Opens IDE / script | Yes — *Settings → Code & reviews* custom prompt ([Assign and delegate](https://linear.app/docs/assigning-issues)) |
| **Cursor Automations** | Cloud Agents on schedule or GitHub/Linear/Slack events | On the chosen trigger | Yes — per-automation **Instruction** + tools + model ([Automations](https://cursor.com/docs/cloud-agent/automations)) |

Disabling **Linear Agent** does not remove Cursor from Assignee → Agents. They are different installs. KIT-7 still showed Cursor under Agents after Linear Agent was Disabled.

---

## Linear-native Cursor agent (delegate)

### What official docs say it does

- Human stays assignee; agent is a separate delegate ([Assign and delegate](https://linear.app/docs/assigning-issues)).
- Delegate **triggers action** ([AI Agents](https://linear.app/docs/agents-in-linear)).
- Cursor admin connects Linear at [cursor.com/dashboard/integrations](https://www.cursor.com/dashboard/integrations); then Assignee → Cursor ([Linear integration](https://cursor.com/docs/integrations/linear)).
- Follow-ups: `@Cursor` in a Linear comment ([Linear integration](https://cursor.com/docs/integrations/linear)).
- Outcome: Cloud Agent status in Linear; **PR when complete** ([Linear integration](https://cursor.com/docs/integrations/linear), [Cursor Integration](https://linear.app/integrations/cursor)).
- Developer API: assigning an issue to the app sets `delegate`, not `assignee` ([Agents developer](https://linear.app/developers/agents)). An **`AgentSession` is created automatically** when an agent is mentioned or delegated; the `created` webhook means *start a new agent loop* ([Agent interaction](https://linear.app/developers/agent-interaction)).
- Linear agent best practice (for agents that follow it): if the issue is not already `started` / `completed` / `canceled`, **move it to the first `started` status** ([Agent best practices](https://linear.app/developers/agent-best-practices)). In this factory that first `started` state is **Implementing** (`factory.config.json`). Docs do not confirm Cursor does this; they also do not say it will not. If it does, delegate on Backlog **skips planner**.

### What you can configure (official)

From [Linear integration → Configuration](https://cursor.com/docs/integrations/linear):

| Knob | How |
| --- | --- |
| Default repo / model / base branch | Cursor Dashboard → Cloud Agents |
| Override repo / branch / model | `[repo=owner/repo]`, `[branch=…]`, `[model=…]` in issue text/comments, or parent/child Linear labels (`repo`, `branch`, `model`) |

**Not listed:** custom system prompt, role (planner vs checker), tool allowlist, “do not open a PR”, “do not start if blockedBy”.

Dashboard default **base branch** and **default model** have been reported ignored for Linear-triggered agents; Cursor staff treated that as a bug and suggested `[branch=…]` / `[model=…]` in the issue ([forum](https://forum.cursor.com/t/base-branch-setting-in-cloud-agents-is-ignored-in-linear/149985), [forum](https://forum.cursor.com/t/linear-triggered-cloud-agents-ignore-default-model-dashboard-setting/153209)). Treat as first-party staff, not a docs page.

### Linear “Agent guidance”

Workspace/team markdown at Settings → Agents → Additional guidance is **passed to the agent**, but *how it is interpreted depends on the specific agent integration* ([AI Agents](https://linear.app/docs/agents-in-linear)). It is not a substitute for four Automations prompts. Cursor does not document that Linear guidance replaces the Linear-integration system prompt.

### Gaps (docs do not say)

- No toggle: “delegate without starting a Cloud Agent”.
- No mapping: Linear status → different Cursor agent types.
- No promise that Cursor honors `blockedBy`, write-scope, or “do not merge”.

---

## Cursor Automations (this factory’s runtime)

Official Linear triggers ([Automations](https://cursor.com/docs/cloud-agent/automations)):

- Issue created
- Status changed
- End of cycle

**Delegate is not a trigger.** Factory contract already records this: *Cursor’s Linear trigger fires on issue created / status changed / end of cycle — not on delegate* (`docs/agents/automations.md`).

Per automation you choose:

- Trigger (cron and/or Linear status)
- **Instruction** (the custom prompt)
- Tools (Linear MCP, Open PR, GitHub checks, MCP, computer use, …)
- Model
- Repo / branch (`lanes.integration` = `development`)
- Permission scope (private vs team-owned service account)

GitHub Automations also expose **CI completed** ([Automations](https://cursor.com/docs/cloud-agent/automations)). Checker today wakes on Linear `In Review` and then reads GitHub checks (`WORKFLOW.md`). A second trigger on CI completed is possible later; it is not required for the verdict.

Cloud Agents clone the repo, so they also see git-tracked `AGENTS.md`, `.cursor/rules/`, `.cursor/hooks.json`, and `.cursor/agents/*.md` **if the Instruction tells them to read those files**. Automations docs: write the prompt like a cloud-agent run; at-mention tools ([Writing prompts](https://cursor.com/docs/cloud-agent/automations.md#writing-prompts)). This factory pastes a short Instruction that says *read `factory.config.json` then `WORKFLOW.md`* and follow `.cursor/agents/planner.md` / `/implement` / `/code-review` / `/land`.

`.cursor/agents/*.md` (planner, checker, devops, …) are **Cursor subagents**, not Linear session identities. The parent may spawn them from YAML `description` ([Subagents](https://cursor.com/docs/subagents)). They are not Assignee options. Linear only lists installed **app users** (Cursor, Linear Agent, …).

Cloud Agents (any start path) also read `AGENTS.md` ([Cloud agent setup](https://cursor.com/docs/cloud-agent/setup.md#add-cloud-specific-instructions-to-agentsmd)) and can auto-fix GitHub Actions on PRs they opened unless disabled / `@cursor autofix off` ([Capabilities](https://cursor.com/docs/cloud-agent/capabilities.md)). That autofix is the opposite of this factory’s judge-only checker.

A third runtime, unrelated to Cursor Automations: Linear **coding sessions** (Claude/Codex in Linear’s sandbox) ([Coding sessions](https://linear.app/docs/coding-sessions)). Disable via Linear Agent settings, not via Cursor.

---

## Can Linear-started Cloud Agents get factory instructions?

| Mechanism | Reaches Linear-delegate Cloud Agent? | Reaches Automations Cloud Agent? | Role-specific (planner vs checker)? |
| --- | --- | --- | --- |
| Automations **Instruction** | No — different entrypoint | **Yes** — this is the control | **Yes** — one automation per role |
| Repo `AGENTS.md` / `.cursor/rules` | Likely yes (clone includes them; [Rules / AGENTS.md](https://cursor.com/docs/context/rules)) | Yes, same clone | Weak — one global file, not four roles |
| `.cursor/agents/planner.md` etc. | Only if the hardcoded Linear prompt tells the agent to open them | Yes, if Instruction says so | Yes, when Instruction names the file |
| Linear Agent guidance | Maybe; Cursor-specific interpretation undocumented | N/A (not the Linear Agent) | No |
| Linear Code & reviews custom prompt | **No** — that is “Work on issue”, local tool launch | No | One prompt for IDE open |
| `@Cursor` comment | Follow-up to the **already started** generic agent | No | No |
| `[repo]` `[branch]` `[model]` | Yes | Automations have their own repo/model settings | No |

Cursor staff (forum, not docs): Linear assign / `@Cursor` uses a **hardcoded system prompt**; `[key=value]` does not override it; Automations with Linear lifecycle triggers are the path with full prompt/tool control ([Can't customize Prompt for Linear agent](https://forum.cursor.com/t/cant-customize-prompt-for-linear-agent/154683)).

So: you can *influence* a Linear-started agent via `AGENTS.md` and comments. You **cannot** give it the factory’s four distinct contracts (planner must not code; checker must not implement; land only on Done).

---

## Comparison against this factory’s handshake

Handshake from `docs/agents/automations.md`: planner claim → implement PR → checker (+ GitHub CI) → Ready for merge → Nicklas Done → land. One issue, one branch, one PR. Unresolved `blockedBy` is the limiter.

| Requirement | Linear-delegate Cursor | Cursor Automations (wired) |
| --- | --- | --- |
| Human assignee stays Nicklas | Yes | Yes (never set Assignee to Cursor) |
| Quiet “released” flag without starting code | **No** | Use `ready-for-agent` + Backlog; planner cron |
| Honor `blockedBy` before coding | Not documented; KIT-10 started while 8/9 open | Planner eligibility |
| Distinct planner / implement / checker / land | **No** — one coding agent | **Yes** — four Instructions |
| Checker before merge; no agent → Done | Agent aims to open a PR; does not own Ready for merge | Checker judge-only; approver → Done |
| Same branch/PR on resume | New Cloud Agent each time either way; Automations encode “same PR” in Instruction | Explicit in implement Instruction |
| Custom tools (Linear MCP only on planner) | Not configurable per Linear-delegate | Per automation tool list |
| Parallel with Automations | **Collision** (KIT-10 PR #3 and #7) | Intended single runtime |

---

## Verdict

**Do not execute the factory from Linear Assignee → Cursor.** It is designed as “issue → Cloud Agent → PR”. That is useful as a *manual* “just code this ticket” escape hatch (`@Cursor` / Work on issue), not as the control plane.

**Keep Cursor Automations** as the autonomous runtime:

1. Planner cron: Backlog + `ready-for-agent` + unblocked → `Implementing` (drop `requireDelegate` if Agent cannot be a quiet flag).
2. Implement: status → `Implementing`.
3. Checker: status → `In Review` + GitHub checks.
4. Land: status → `Done`.

**Custom instructions for the agent types you built** = Automations Instruction blocks in `docs/agents/automations.md`, plus the files those prompts load (`WORKFLOW.md`, `.cursor/agents/*.md`, skills). Linear-delegate cannot host those four personalities.

Optional, non-conflicting:

- Linear **Work on issue** custom prompt for *local* IDE starts (not Cloud Agent factory).
- Linear **Agent guidance** as extra hints (best-effort).
- Keep Cursor installed so `@Cursor` follow-ups on an *already running Automation* session still work — but do not delegate from the Assignee menu.

---

## Sources

- [Linear: Assign and delegate issues](https://linear.app/docs/assigning-issues)
- [Linear: AI Agents](https://linear.app/docs/agents-in-linear)
- [Linear: Linear Agent](https://linear.app/docs/linear-agent)
- [Linear: Coding sessions](https://linear.app/docs/coding-sessions)
- [Linear: Cursor integration (marketplace)](https://linear.app/integrations/cursor)
- [Linear: Agents developer](https://linear.app/developers/agents)
- [Linear: Agent interaction](https://linear.app/developers/agent-interaction)
- [Linear: Agent best practices](https://linear.app/developers/agent-best-practices)
- [Cursor: Linear integration](https://cursor.com/docs/integrations/linear)
- [Cursor: Cloud Agents](https://cursor.com/docs/cloud-agent)
- [Cursor: Cloud agent setup (`AGENTS.md`)](https://cursor.com/docs/cloud-agent/setup)
- [Cursor: Cloud agent capabilities (CI autofix)](https://cursor.com/docs/cloud-agent/capabilities)
- [Cursor: Automations](https://cursor.com/docs/cloud-agent/automations)
- [Cursor: Subagents](https://cursor.com/docs/subagents)
- [Cursor: Rules / AGENTS.md](https://cursor.com/docs/context/rules)
- Repo: `docs/agents/automations.md`, `WORKFLOW.md`, `factory.config.json`
- Observation: KIT-7 activity 2026-08-17 (delegate → session started)
- Staff forum (not docs): [hardcoded Linear prompt](https://forum.cursor.com/t/cant-customize-prompt-for-linear-agent/154683)
