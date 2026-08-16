---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

# Research

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md).

Spin up a **background agent** to do the research, so you keep working while it reads.

Research **feeds** `/grill-with-docs`. It does not replace grilling, publish tickets, or move Linear.

## Factory twist

- Primary sources only: official docs, this repo’s source, specs, first-party APIs. MCP/docs tools are fine when they fetch those sources. Not a blog recap of them.
- Save under `{paths.specs}/<effort>/research.md` when an effort exists; otherwise `{paths.specs}/research/<slug>.md`. Say the path.
- **Redact** secrets, cookies, `Authorization` headers, `LINEAR_API_KEY`. Cite names of env vars, never values.
- Do not open a PR, `/land`, or file Linear issues from this skill.

## Job

1. Investigate the question against **primary sources**. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where this factory keeps notes (the paths above).
