# Hierarchy grains are the first public seed interface

Football Data Seed’s first accept is the Hierarchy grain (League, League season, Club, Club season, NationalTeam, NationalTeam season, Player, Player season): fetch → normalize → map, plus a Seed reference, writing Transfermarkt facts to the lane. Club and NationalTeam are siblings — not a kind on Club. Football Kit Archive grains write Kit identity and admin_only bytes next. The one-sentence Seed run (ADR-0014) is the Join workflow milestone. Cross MCP is last. Nest never grows `/v1` seed endpoints.

Status: accepted. ADR-0014 remains the operator protocol for Join workflow and after; it is not the first milestone accept.
