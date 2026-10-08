# Video brief — splash-play-to-grid

**Workflow**: ordinary `generate_video` (default `marketing_studio_video` for ads/products) after kit stills via `brand-asset-creation` — chosen over `faceless-video` because that flow is NOT for ads, silent animation, or product demos and burns subtitles; over UGC siblings because those require voiceover or a talking head; over `product-photoshoot` because that flow is stills, not video ads; over `video-editing` because that flow does not generate new AI footage.
**Date**: 2026-09-05
**Lock**: docs/video-system.md as of 2026-09-05

## Job

**Outcome**: Unsigned first-session splash feels like KitCollective — a mute full-screen loop behind lockup + Login / Opret, so a collector stays and taps.
**Audience**: A Nordic football-shirt collector opening the app for the first time.
**Promise**: The match ends; the shirts remain as a collection you can see.
**Where it runs**: Expo first-session `place: splash` — 9:16 full-bleed background under existing chrome. Not the iOS launch screen. Not discovery (that screen already shows real UserJerseys).

## Script inputs

**Hook intent**: Showtime in the first two seconds — floodlit cage, bodies in play, shirts large in a phone frame. No spoken hook; the picture is the hook.
**Beats in order** (mute, 10 s, compressed 9:16 cover):
1. **0–2 s** — Tight, phone-filling: floodlight cage mesh and two players (white kit vs black kit) at kickoff. Torso-up. Centre of frame stays darker and quieter for the client lockup.
2. **2–5 s** — Active play, still compressed: pass, sprint, or duel. Faces allowed; no celebrity lookalikes. No wide pitch, no stadium, no scoreboard, no tifo.
3. **5–7 s** — Shirt comes off over the head (or is pulled into frame). KC lockup/monogram readable on the chest. White kit uses Como-*grammar* only (clean white, quiet tonal body, navy collar/cuff) — not a replica. Black kit same cut. No crests, no manufacturer marks.
4. **7–9 s** — Optional single-frame shutter blink. Same shirts hang on a rail in showtime light — a collector ophæng, not app tiles. Bottom of frame stays clear of faces (dock lives there in the client).
5. **9–10 s** — Rail holds, then falls back into the kickoff frame of beat 1 so the loop is seamless.
**Closer / CTA**: No CTA in the file. Client chrome owns “Tryk for at fortsætte”, Login, Opret konto.
**Domain words**: This file has no speech. If a later prompt describes the product, use **Kit** (catalog design) vs **UserJersey** (owned copy). Do not say listing, jersey-as-catalog, marketplace, price, or worth.

## Claims

| Claim | Allowed wording | Why we can stand behind it |
| --- | --- | --- |
| Passion remains as shirts you can see | Visual only: play → shirt off → rail | PRD user goal: visual overview of the collection on the phone |
| KC is the only chest mark | Visual only: lockup or monogram as sponsor | Logo foundation; fictional prize kits; no real-club IP |

**Off limits**: Any burned text. Prices, DKK, “worth”, user counts, “best”, authenticity. Real clubs, Como replica, adidas Trefoil / Three Stripes / Nike / Puma. Invented crests. Confetti. Green / multi-accent palettes. App UI, 4:5 Samling grid, screenshots.

## Craft

**Language and accent**: None. Mute. Explicit override: do not burn captions; do not add English or Danish VO. (UGC/faceless defaults are American English + subtitles — those workflows are not used.)
**Duration**: 10 seconds. First frame = last frame.
**Aspect and resolution**: 9:16 full-bleed **cover** on a mobile screen. Compressed framing: shirts and bodies fill the phone; no letterbox; no cinema-wide masters. *Model output size: workflow-pinned.*
**Captions**: None. *Not* the subtitles workflow.
**Creator persona**: Generated adult footballers per `docs/video-system.md`. Faces OK. No celebrity lookalikes. No supplied photos.
**On screen**: No URL, no screenshots, no Expo UI. Product in world: fictional prize kits + rail.
**Assets in hand**: Official marks to lock (upload at spend, do not invent): `apps/mobile/assets/brand/kitcollective-lockup-white.svg`, `kitcollective-lockup-black.svg`, `kitcollective-monogram-white.svg`, `kitcollective-monogram-black.svg`. Colour only `#FFFFFF` or `#0A0A0A`. No Higgsfield `media_id` yet. Kit stills are produced first (`brand-asset-creation`) and passed as `medias[]` into `generate_video`.

**Mobile safe zones** (compose the pixels so chrome can sit on top):
- Centre plate: darker, less busy — white lockup + caption.
- Bottom: no faces, no shirt numbers — Login / Opret dock.
- Upper half + edges: play and rail.

## Spend

**Credits**: Owner said go 2026-09-05. Higgsfield MCP still **401 / session expired** after in-chat `mcp_auth`. Render blocked until Nicklas re-authorizes the connector (remove and re-add if reconnect does not trigger login), then retry this slug. Do not pass `use_unlim` unless Nicklas asks.
**Approved by**: Nicklas on 2026-09-05 (go in chat). Spend not executed.

## Delivery

**Deliverable**: —
**Degraded**: —
**Verdict**: —

## Production order (this slug)

1. `brand-asset-creation` — white + black stilren prize kits with KC chest mark from the SVG kit.
2. `generate_video` — image-to-video from those stills, 9:16, 10 s, mute, loopable.
3. Client (later, design-system gap): `expo-video` `loop` + `muted`, `nativeControls={false}`, Reduce Motion = first frame.
