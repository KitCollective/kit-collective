# Apify learns Transfermarkt facts

Fase 0 stamdata for clubs, leagues, seasons, players, and squad numbers comes from Transfermarkt via Apify, not from a licensed match API.

Research (`catalog-seed-sources.md`) forbids Transfermarkt bots: ToS §11.1, reserved TDM, no unofficial API. We still use Apify because we need historical club-season-number depth that Sportmonks/API-Football do not sell cheaply for a Denmark-first catalog. Apify does not change Transfermarkt’s ToS.

Mitigations that stay locked: a separate seed repo (not Nest at request time); facts only (no market value, agent PII, or TM branding); our UUID is PK; their id hangs on `ExternalId`; re-run the mapper, do not reshape Nest.

Status: accepted. Live *transport* (Store actor vs kader HTML) is superseded by ADR-0015. Facts-only, ExternalId, and “not Nest” still hold. Supersedes the seed-sources “do not scrape Transfermarkt” recommendation for this pipeline only.
