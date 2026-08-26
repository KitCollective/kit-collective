# One Seed sentence starts the whole run for that scope

The operator writes one natural-language sentence. The job then fills that Seed scope: “Seed FC København 2015/16 including squad and numbers” or “Seed Bundesliga from 05/06 to 19/20 including clubs, squads, and numbers.” They do not @ club, then season, then squad. Internally the same Fetch steps still run (ADR-0013). A club-season sentence may run from Cursor MCP; a competition Season range that takes hours still runs on Coolify (ADR-0012).

This supersedes the operator-facing hop sequence in ADR-0013 and the implication in ADR-0006 that every Seed run is only a competition + range.

Status: accepted
