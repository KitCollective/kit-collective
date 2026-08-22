# Catalog peek is unstyled Nest HTML, not the product admin

After a Seed run we need to see clubs, squads, and kits without waiting for a designed `apps/admin`. That peek is `GET /v1/catalog/peek` — a development-oriented HTML table on Nest, not a new admin app and not `/to-design`. Existing `GET /v1/catalog/stats` stays as machine-readable counts. Archive `KitPhoto` bytes stay `admin_only` and are not rendered as public images on the peek.

Status: accepted.
