# Seed MCP is token-gated

Seed MCP listens on its own hostname and requires a bearer token on every request. Missing token fails closed. Document the env **name** only; never commit the value. Coolify’s API token is a different secret and is not this token. The server is not an anonymous public MCP.

Status: accepted.
