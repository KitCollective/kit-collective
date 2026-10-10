# Site Unblocker is the Transfermarkt transport

Decodo Site Unblocker (`unblock.decodo.com:60000`) carries live Transfermarkt HTML wherever `SEED_PROXY_URL` is set — Coolify **and** Desktop. `SEED_TM_TRANSPORT=direct` is the documented opt-out; `SEED_REQUIRE_PROXY` stays fail-closed.

Measured on Desktop before deciding:

- **Direct laptop IP** answers the same kader URL 502, 502, 502, timeout, 200. Transfermarkt's own edge, not a block.
- **Unblocker with no `X-SU-*` header** is HTTP 202 with a 2.4 KB AWS WAF challenge (`awsWafCookieDomainList`, `gokuProps`) on all three URL shapes. 0/3.
- **Unblocker with `X-SU-Geo` only** clears the WAF ~75 % of the time in ~1.5 s; the misses are HTTP 405 with a 2.1 KB "Human Verification" body, plus one HTTP 200 truncated to 251 bytes.
- **Unblocker with `X-SU-Headless: html`** cleared 9/9 attempts across competition season page, club kader, and player profile in 8–10 s, and cleared every URL the cheap pass lost.
- **`X-SU-Session-Id`** changed nothing measurable; the rendered pass already clears the WAF. Kept as an opt-in knob.

So: the cheap pass first, a rendered pass only when the WAF answers (`SEED_PROXY_HEADLESS=auto`). `html` forces rendering, `off` forbids it.

Consequences for the fetch policy:

- **WAF 202 (and any status carrying a challenge marker) is a retryable block**, not a fatal error. It counts against the circuit; a transient 5xx does not.
- **Transient 5xx, 408/425/429, undici timeouts, and aborts are retried** — that is Transfermarkt's edge, and giving up on it loses a whole club-season.
- **A 200 under 5 KB is a relay artefact**, reported as its own retryable error rather than parsed into an empty squad.
- **HTML cache is on by default** (`SEED_KADER_CACHE`, default `seed/apify/.cache/transfermarkt`). A re-run of a bulk queue costs Transfermarkt nothing, which matters because the Site Unblocker plan is metered per request (`x-plan-remaining`).
- **Pacing is transport-aware**: 1500 ms between GETs on the direct laptop IP, 250 ms behind the Unblocker, which hides our IP and advertises its own `ratelimit-limit: 200`.

Portrait bytes keep going to the image CDN (`img.a.transfermarkt.technology`) on the direct connection — it is not WAF'd, and paying a metered Unblocker request per portrait is waste.

Football Kit Archive still must not use Decodo (ADR-0041). Nest still never hits Transfermarkt.

Status: accepted.
Supersedes: ADR-0042 on the Desktop default only ("local grain uses the local IP unless `SEED_TM_TRANSPORT=proxy`"). The rest of ADR-0042 — one transport module, `SEED_REQUIRE_PROXY` fail-closed, FK never on Decodo — still holds.
