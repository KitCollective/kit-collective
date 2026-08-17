# Two Linear projects: product and seed

The product git repo is one remote (`kit-collective`) with `seed/` inside it (ADR-0003). Linear still splits: one project for the product (Coolify, schema, Nest, clients, later design) and one project for all seed (`seed/apify` and `seed/fkapi`).

Seed maintenance is unknown and is not a vertical slice of the Expo/Nest app. One seed board keeps Apify and FK jobs together without putting fetch tickets on the product board. `/to-spec` creates two projects, not three and not one.

Status: accepted. Settles the Linear-project count left open when ADR-0001 was superseded.
