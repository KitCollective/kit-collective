---
name: create-new-skill
description: Author a factory skill under .cursor/skills with Matt’s writing-for-agents discipline. Use when creating, writing, editing, or scaffolding a new skill, SKILL.md, or agent-facing doc in this repo — not Cursor’s generic create-skill, not a domain helper.
---

# Create a new skill

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md).

This is Matt’s **writing-for-agents** plus the old **write-a-skill** process, named `/create-new-skill` for this factory. Cursor’s built-in `create-skill` does not know the factory layout — use this instead.

Writing discipline: [WRITING.md](WRITING.md). Frontmatter and invocation: [SKILL-MECHANICS.md](SKILL-MECHANICS.md).

## Factory twist

- Working skills live in **`.cursor/skills/<name>/`**. Never `~/.cursor/skills-cursor/`. Never recreate `.agents/`.
- Vendored third-party packs (Expo) stay namespaced at **`.cursor/skills/expo/<skill>/`**. Do not flatten them into factory skills. Do not add factory `agents/openai.yaml` on top.
- **Domain helpers** (Nest, Drizzle, Expo, …) live in `paths.helpers` (default `.cursor/agents/`). They are not skills and they never own Linear issues. If the user wants product specialization, write a helper, not a skill.
- Skills stay **generic**. Product names, team keys, and lanes come from `factory.config.json`.
- Every skill gets `agents/openai.yaml` (`display_name`, `short_description`). User-invoked skills also set `policy.allow_implicit_invocation: false` and `disable-model-invocation: true`.
- After the files exist: `skills-lock.json`, this repo’s `/ask-me` map, and — if agents must discover it — a pointer in `scripts/generate-harness-docs.mjs` then `node scripts/generate-harness-docs.mjs`.
- A user-invoked skill may invoke model-invoked skills, never another user-invoked one. `/ask-me` is the router; update it when a user-reachable skill is added or renamed.

## Process

### 1. Gather

Ask (or infer from this conversation):

1. **Job** — what task, and when should it fire?
2. **Skill vs helper** — generic loop → skill; stack/product specialization → helper under `paths.helpers`.
3. **Invocation** — user-invoked (human is the index) vs model-invoked (agent must reach it, or another skill must). Default user-invoked unless the agent must discover it.
4. **Matt source** — if this is a port, name the upstream path (`skills/engineering/…`). Copy the loop, then add a **Factory twist** section. Do not wrap Matt by pointer.
5. **Scripts** — only for deterministic work (validate, generate, bootstrap).

Verbatim wording from the user goes into `SKILL.md` unchanged.

### 2. Draft

```text
.cursor/skills/<name>/
├── SKILL.md
├── agents/openai.yaml
├── references/          # optional, progressive disclosure
└── scripts/             # optional, deterministic only
```

`SKILL.md` frontmatter:

```markdown
---
name: <name>
description: <what it is>. Use when <trigger branches>.
disable-model-invocation: true   # omit for model-invoked
---
```

Start the body with load-factory + the twist, then Matt’s steps. Follow [WRITING.md](WRITING.md): leading words, completion criteria, prune no-ops, prompt the positive.

`agents/openai.yaml`:

```yaml
interface:
  display_name: "<Title Case>"
  short_description: "<one line>"
```

User-invoked: add `policy.allow_implicit_invocation: false`.

### 3. Review

Show the draft. Confirm invocation, triggers, and that it is not a helper in disguise.

### 4. Wire

- `skills-lock.json` — `source`, `sourceType`, `skillPath` (Matt path or `factory` if original).
- `/ask-me` — add the skill to the correct section (main flow, on-ramp, vocabulary, factory-only, standalone).
- Agent-facing pointer → edit `.cursor/skills/bootstrap-linear/scripts/generate-harness-docs.mjs`, then `node scripts/generate-harness-docs.mjs`.
- Do not invent Linear statuses. Do not teach the skill to push `lanes.staging` or `lanes.production` from an issue land.

Done when the skill directory exists, lock + ask-me are updated, and (if needed) generated `AGENTS.md` mentions it.
