# Seed MCP

Thin adapter over the Apify and FK seed CLIs. Chat is the human path. `/tdd` stays on the CLIs (`seed/apify`, `seed/fkapi`).

## Tools

| Tool | CLI | Writes |
| --- | --- | --- |
| `seed_apify` | `seed/apify` | Transfermarkt facts (Club, League, Season, TeamSeason, Player, PlayerClubSeason, CatalogLabel, ExternalId) |
| `seed_fk` | `seed/fkapi` | Kit identity + `admin_only` KitPhoto keys (`rights: unresolved`) |

Both take the same CLI interface: `competition`, `from-season`, `to-season`, `lane`.

- `0001` is that competition’s first season, not a calendar year.
- Run Apify for the scope before FK. FK refuses missing Club/Season rows.
- Omit `lane` → **development** database on the CX33.
- Pass `staging` only when the human named that lane.
- **Production is impossible** from these tools (not in the schema; rejected if forced).

## Enable in Cursor (Nicklas)

This is the human checkbox on KIT-10. Agents must not write `.cursor/mcp.json`.

1. From the repo root, install this package once: `npm install --prefix seed/mcp`
2. Merge `cursor-mcp.json.example` into `.cursor/mcp.json` (or `~/.cursor/mcp.json`) as server `kitcollective-seed`.
3. Restart Cursor MCP. Confirm `seed_apify` and `seed_fk` appear as tools.
4. Tick the Linear checkbox.

The server speaks stdio. Start it only via Cursor. Do not put `DATABASE_URL` or R2 values in git.

## CLI bins

Default lookup (override with env):

| CLI | Env | Default |
| --- | --- | --- |
| Apify | `SEED_APIFY_BIN` | `seed/apify/bin/seed.mjs` (then `src/cli.ts`) |
| FK | `SEED_FK_BIN` | `seed/fkapi/bin/seed.mjs` (then `src/cli.ts`) |

Flags passed through: `--competition` `--from-season` `--to-season` `--lane`.
