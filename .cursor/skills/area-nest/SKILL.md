---
name: area-nest
description: Area skill for Nest /v1 and auth. Load on demand from the Backend Role when the slice touches Nest modules, HTTP, IAP, Vision jobs, or auth. Not an agent id.
---

# Area skill — Nest

This is an **Area skill**, not a Role subagent. Implement lead does not spawn an agent named Nest.

Load from Backend before writing Nest HTTP or auth:

- `.scratch/Architecture/tech-stack.md` — module boundaries, Fastify `/v1`, JWT auth
- Secrets stay in Nest env / GitHub Environments. A new required boot env must be set on every workflow that starts this process.

Return to the Backend Role. Do not change Linear status.
