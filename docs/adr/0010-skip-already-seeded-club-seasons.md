# Skip Transfermarkt fetch when a club-season is already seeded

A Seed run must not re-scrape a club + season that already has a squad with jersey numbers in our Postgres (e.g. FCK 2010/11). Skip the Apify call for that pair and continue the league → season → club walk. Upsert on `ExternalId` still applies when we do fetch. Operators can force a refetch later; the default is skip-to-save time and Apify cost.

Status: accepted
