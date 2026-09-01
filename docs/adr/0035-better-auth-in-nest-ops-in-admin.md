# Better Auth lives in Nest; staff sees it in Admin SPA

Identity stays one User on our Postgres. Nest embeds the Better Auth library and connects `dash` + `sentinel` so we can pull Auth events and Auth security. Staff never signs into `dash.better-auth.com` — Auth ops is Admin SPA only (ADR-0018: not a second IdP). Sentinel needs their Pro infrastructure; that is a vendor for detections, not the login product.

Status: accepted.
