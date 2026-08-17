# Seed lives in the product git repo

Apify and Football Kit Archive ingest are not separate GitHub repositories. They live at top-level `seed/apify` and `seed/fkapi` in `kit-collective`. Isolation is a folder and import boundary, not a second remote.

Nest never imports `seed/`. Product Docker and CI path-filter seed out of `apps/api`. Each tree ships a CLI (`fetch` → `normalize` → `map` into `DATABASE_URL`) that Coolify runs as jobs, not as 24/7 services. Do not name this tree `scraper/` or put it under `apps/` or `packages/`.

Supersedes ADR-0001 on the git-repo split. Linear project count is a separate decision.

Status: accepted
