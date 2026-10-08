# Toulouse / Nicolaisen Vision eval — 2026-09-21

## Ground truth (visual + Football Kit Archive lookup, no scrape)
- **Club:** Toulouse FC (not Anderlecht)
- **Season:** 2024/25 home (Nike, purple + white sash, LP Promotion) — https://www.footballkitarchive.com/toulouse-fc-2024-25-home-kit/
- **Type:** home
- **Player:** Rasmus Nicolaisen #2 (signed back)
- Motto on back collar: DEBOUT. TOUJOURS.
- Player career prior in our DB: Midtjylland + Toulouse (so Anderlecht is not a career club)

## Vision Matcher results (local Nest)
| Photo | Status | Club | Season | Type | Player |
|---|---|---|---|---|---|
| Front (crest/sponsor) | noop ×3+ | — | — | — | — |
| Detail (number crop) | noop ×3+ | — | — | — | — |
| Back (NICOLAISEN 2) | **ready** | **RSC Anderlecht ❌** | **2019/20 ❌** | home ✅ | Rasmus Nicolaisen ✅ |
| Grouping (all 3) | noop | — | — | — | — |

### Model raw (back job)
`clubHint: "RSC Anderlecht"`, `seasonHint: "2019/20"`, `kitType: home`, `playerHint: Nicolaisen`, `playerNumberHint: 2`, Nike, purple.

**VLM misread the club**; mapper followed the wrong hint. Toulouse exists in catalog; Nicolaisen is linked to Toulouse seasons — a correct clubHint would likely have mapped.

## Prefill verdict
**Not good enough for Confirm prefill on this shirt.**
Player-from-back works. Club/season wrong when it fires. Front often `noop`. Grouping did not bind the three angles.

## Improvements without full FKA scrape
1. **Multi-photo identity** — front+back in one job (crest/sponsor/motto + name/number).
2. **Player→club prior** — bias club candidates to the mapped player’s clubs (Nicolaisen → Toulouse, not Anderlecht).
3. **Hard cues in prompt** — LP Promotion, DEBOUT. TOUJOURS., Ligue 1 McDonald’s patch, crest.
4. **On-demand FKA page check** for club+season candidates as verifier (not a crawl).
5. **noop retry/telemetry** — don’t leave Confirm blank after silent empty VLM.
6. **Grouping regression** — 3 photos of same shirt must become one group.

## Product takeaway
Soft-demo only with human Confirm. Do not promise one-shot club/season/type/player prefill for unfamiliar purple kits yet.
