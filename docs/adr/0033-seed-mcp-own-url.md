# Seed MCP has its own URL, not Coolify’s

Coolify MCP is the Docker and host catalog. Ingest is a different server: **Seed MCP**, with its own URL. Coolify may host that container. Chat that seeds Hierarchy grains or a Join workflow calls the Seed MCP URL. It does not call Coolify `control`, and it does not share Coolify’s MCP URL. Long jobs run in the Seed MCP service. `kc_seed_mcp` stdio is the predecessor, not the Cross MCP accept. Auth is ADR-0034.

Status: accepted.
