# Competition identity is resolved, not only catalogued

The operator names a league. The Seed job resolves that name to a Transfermarkt competition (id, slug, country) before walking seasons → clubs → squads. Catalog aliases (`superligaen`, `championship`) stay a fast path. Unknown names search Transfermarkt schnellsuche. Country words disambiguate (`tyrkiske Superliga` is Türkiye Süper Lig, not Superligaen).

A closed slug list is not the product ceiling. Ambiguous hits fail with candidate names.

Status: accepted
