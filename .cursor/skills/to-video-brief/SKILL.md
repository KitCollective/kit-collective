---
name: to-video-brief
description: Interview that locks a video brief, then runs the matching Higgsfield workflow.
disable-model-invocation: true
---

# To video brief

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md). Read `CONTEXT.md`, then `docs/video-system.md` and `docs/design-system.md` if they exist.

This skill turns a loose video idea into a **brief** precise enough that a Higgsfield workflow renders it without inventing anything, then runs that workflow. It writes `docs/video-system.md` (the durable lock) and one `{paths.specs}/video/<slug>/brief.md` per video.

## Higgsfield owns the prompt

Every Higgsfield workflow arrives from the MCP as a full SKILL.md: locked models, prompt architecture, word density per second, caption burning, identity locks. Those decisions are **pinned** — the workflows' own word — and they say so in the imperative: *"Everything technical is pinned — NEVER ask about those."*

Grill what is open; hand the pinned decisions to the workflow. Read the workflow live from `get_workflow_instructions` on every run, so this repo never carries a second, staler copy of Higgsfield's craft.

What Higgsfield cannot know is our side: which product this is, what we are allowed to claim about it, which language a Nordic collector hears, and what appears on screen. That is the brief, and it is the whole job here.

## Factory twist

- **Route by the catalog's own triggers.** `get_workflow_instructions` with no argument lists sixteen workflows with sharp `NOT for` boundaries. Picking the right one carries as much of the quality as the script does, so route before grilling — the chosen workflow decides which questions are still live.
- **Claims are the risk, not phrasing.** The workflow writes the monologue itself. Absent an allowlist it will invent authenticity checks, prices, and user counts. The brief carries claims we can stand behind, in the wording we stand behind.
- **`CONTEXT.md` is the noun authority.** A script that renames our domain in marketing language teaches collectors the wrong words. `docs/design-system.md` says what the app looks like on screen.
- **Say the language out loud.** UGC workflows render American-accented English *"even when the brief is in another language"*, and honour Danish only on an explicit override. The brief states language and accent every time.
- **Nothing enters Linear.** No issue, no status, no branch, no PR. This skill writes two Markdown files and spends Higgsfield credits.
- **Interview in the user's language.** Write both files in English; quote spoken script lines verbatim in the language they ship in.

## Mode

| Mode | When | Work |
| --- | --- | --- |
| **Lock** | No `docs/video-system.md` | Round 1 locks durable brand truth (voice, persona, claims, language, formats), then this video's brief. |
| **Brief** | The lock exists and still fits | This video's brief only. Contradiction with the lock is a decision for the human, not a quiet override. |

## Process

### 1. Ground

Read `CONTEXT.md`, `docs/video-system.md`, `docs/design-system.md`, and the `{paths.specs}` material for the surface this video sells. Confirm the Higgsfield session with one cheap call (`list_workspaces`); an expired session needs the human to re-authorize the connector before anything renders.

Say the idea back in one sentence, and name the slug for `{paths.specs}/video/<slug>/`.

**Done when:** the human agrees your one-sentence version is their idea, the session is live, and you can name which product truth already exists in writing versus which lives only in their head.

### 2. Route

Read the catalog, then load the candidate with `get_workflow_instructions({ workflow })`. Match the idea against the workflow's own triggers and its `NOT for` list. Neighbouring UGC flows differ by one hinge each — whether a creator speaks on camera, whether a page appears on screen, whether a reveal is the climax — so name the hinge that selected this one.

Then read that workflow's `Asking the user` section and hard rules, and write down two lists: what it pins, and what it leaves to us.

**Done when:** the human has confirmed the workflow, you can say which sibling it beat and on what hinge, and every open decision comes from the workflow's own text rather than from memory.

### 3. Grill

Work a **frontier** in rounds — the shape `/grill-with-docs` and `/to-design` use. Number every question, give your recommended answer, then wait.

```text
❓ **Q1** - **<title>**: <body, choices if any>

➡️ <your recommended answer>
```

Facts are your job: read the repo, read the workflow, read the app. Decisions are the human's.

In **Lock** mode, round 1 locks the durable layer from [references/VIDEO-SYSTEM-MD.md](references/VIDEO-SYSTEM-MD.md): feel in a few words, north-star and anti-reference videos, spoken language and accent, creator persona, claims we can stand behind, formats and platforms we ship.

Then work this video's open decisions — the fields of [references/BRIEF-MD.md](references/BRIEF-MD.md), minus everything the workflow pins. A question the workflow already answers is one the human should never see.

**Done when:** the frontier is empty, every field of the brief template is either answered or explicitly marked *workflow-pinned*, and each claim in the script traces to something we can defend.

### 4. Write

Write `{paths.specs}/video/<slug>/brief.md` per [references/BRIEF-MD.md](references/BRIEF-MD.md). As each durable decision resolves, write it into `docs/video-system.md` per [references/VIDEO-SYSTEM-MD.md](references/VIDEO-SYSTEM-MD.md) — during the interview, not after delivery.

**Done when:** both files are on disk, and a reader who missed this conversation could run the workflow from the brief alone.

### 5. Approve, then spend

Show the brief and wait for an explicit go. Rendering costs real credits, and free-trial `use_unlim` is the human's call — pass that flag only when they ask for it, and keep passing it once they have.

Then run the chosen workflow and follow it, including its own end-of-run questions. It owns models, prompt wording, and assembly; the brief is its input.

**Done when:** the human said go, the deliverable's hosted URL is in hand, and any place the workflow degraded (capture failure, moderation retry, talking-head-only fallback) is stated plainly rather than quietly absorbed.

### 6. Verdict

Watch the output against the brief. Record in the lock's verdict log what held and what the workflow drifted on, so the next video starts from evidence.

**Done when:** the lock carries this video's verdict, and any durable correction is folded into the lock rather than left in the brief.

## Output

`docs/video-system.md` (create or update) and `{paths.specs}/video/<slug>/brief.md`. Tell the human both paths, the workflow that rendered it, the deliverable URL, and what the verdict changed in the lock.
