# Coolify may use Decodo Site Unblocker as the Seed proxy

Residential HTTP through `gate.decodo.com` still gets Transfermarkt HTTP 403 after one Superliga club-season. Decodo Site Unblocker is a MITM HTTP proxy (`unblock.decodo.com:60000`) that handles anti-bot for the GET. Live Kader fetch stays Cheerio on kader HTML. The operator points `SEED_PROXY_URL` at the Unblocker endpoint (names only in git).

Decodo **Web Scraping API** (`POST https://scraper-api.decodo.com/v2/scrape`) is still not the fetch. Nest still never hits Transfermarkt. Opt-in Apify is unchanged.

Status: accepted. Supersedes ADR-0015 only on “Decodo browser/Scraping API is not the fetch” for **Site Unblocker as HTTP proxy**. Residential proxy remains valid.
