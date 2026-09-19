# FK seed bulk-ingests kit identity and archive bytes

`seed/fkapi` learns kit identity (club, season, type, manufacturer) from Football Kit Archive and writes `Kit` rows, plus archive image bytes to R2 as `KitPhoto`.

There is no official API and no licence. Research forbade scraping this site. We still bulk-ingest because without those rows there is no catalog Kit, and without bytes agents/admin cannot verify what was fetched. Mitigations stay locked: separate `seed/` tree and CLI jobs (not Nest at request time); `rights: unresolved`; `admin_only`; never Expo, Astro, or Open Graph; users’ own photos remain the product images.

Status: accepted. Supersedes the seed-sources “do not use FKApi commercially” recommendation for this pipeline only.
