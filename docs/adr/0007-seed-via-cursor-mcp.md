# Human chat drives seed via MCP

The operator talks in Cursor in natural language. They do not run seed CLI flags. After MCP is configured once, the agent resolves a competition and season range, runs the seed pipeline, and upserts into our Postgres.

Coolify MCP owns the host and jobs. Seed tool descriptions must explain how searches work (competition identity, “0001” = first season, Apify before FK) so the agent can compose the run without a human-facing CLI.

Status: accepted
