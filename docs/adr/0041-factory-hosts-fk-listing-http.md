# Factory hosts FK listing HTTP on Coolify

Football Kit Archive has no public API. `sunr4y/fkapi` is a self-hosted Django app whose `/api/kits` contract is not the Join CLI (`GET /kits?clubTransfermarktId=`). This factory hosts a 24/7 Coolify application (`seed-fk-listing`) that speaks the `@kit/seed-fkapi` listing contract. That origin is `FKAPI_BASE_URL` (no `/kits` suffix).

We still do **not** vendor sunr4y/fkapi as the Join origin. Direct footballkitarchive.com from CX33 is Cloudflare 403 (HTML and kit JPEGs). Seed proxy / Decodo stays Transfermarkt-only. Live listing fetch behind this host is **Internet Archive Wayback** (`web.archive.org` CDX + `id_` snapshots) — not Decodo, not a naked FKA GET. A refused or empty Wayback result fails closed (4xx/5xx), not an empty 200.

Join CLI: `FKAPI_BASE_URL` → live adapter; else `SEED_FK_FETCH=fixture` → committed proof kits; else throw. No silent fixture default.

Staff ingest is the same origin: `POST /ingest` (Bearer `FK_LISTING_INGEST_TOKEN`), not a second host and not sunr4y/fkapi. `GET /kits` and `GET /health` stay unauthenticated so Join CLI does not break.

Status: accepted.
Supersedes: CONTEXT **FK after facts** “this factory does not host sunr4y/fkapi” as the reason the operator must supply a public URL — that URL does not exist. Proof Join may still run on fixtures until listing HTTP returns kits.
