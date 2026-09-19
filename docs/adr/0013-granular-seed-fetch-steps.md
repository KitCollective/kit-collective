# Seed MCP tools are small Fetch steps, not one nested dump

Chat and CLI expose standalone units: resolve club, resolve season, fetch that club-season squad, then player profile only if the squad row lacks identity or jersey number. A human ask like “FCK 2015/16” is those two or three hops. A long Seed run (Proof run or a Season range) is the same hops in a loop on Coolify — not one Apify/Nest payload that returns a club plus the entire roster, and not hundreds of manual @ calls in chat.

Status: accepted. Operator-facing hop sequence superseded by ADR-0014; Fetch-step granularity and skip-profile-if-squad-complete remain.
