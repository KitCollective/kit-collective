# Seed is a scoped run, not a world dump

Stamdata ingest is on-demand. An operator or agent names a competition and a season range (from that competition’s first season through today, or a tighter window). The seed CLI runs fetch → normalize → map for that scope only, upserting on `ExternalId` when the club or kit already exists.

There is no baked-in “Denmark first” dump in M1. Football Kit Archive mapping for a scope runs after Apify/Transfermarkt facts for that same scope exist, so `Kit` can point at our club and season UUIDs.

Status: accepted. Club + one season as a Seed scope is added by ADR-0014; competition + range stays valid.
