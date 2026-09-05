# Video system

Brand lock for generated video. Briefs apply this file.
Flag missing context; do not invent claims, personas, or numbers.

**Owner**: Nicklas
**Last locked**: 2026-09-05 (grill Q11 + mobile full-bleed)

## Voice

Status: `locked`

**Feel**: Showtime. Strong, active, deliberate — not frantic, not gloomy. The first two seconds should read as a stage (floodlights, play, presence), not a cellar and not a museum. Energy lands in order: the match yields shirts, the shirts become a collection you can see.
**North stars**: (1) Floodlit cage / small-sided court as a *stage* — prime-time light, not broadcast stadium. (2) Shirt *grammar* from Como 1907’s 2026/27 white away: clean white base, quiet tonal body, restrained navy at collar and cuff — **construction only**. Never the Como crest, adidas Trefoil, Three Stripes, Revolut, or a replica of that shirt. ([Como 1907 official unveil](https://comofootball.com/en/como-1907-and-adidas-unveil-the-2026-27-away-jersey/))
**Anti-references**: FIFA intros; Nike “Write the Future”; StockX/GOAT drop-hype; Shirt Squad database-flex; Premier League Fantasy wash behind a jersey photo; talking-head UGC; fold-out / still-life lookbook; copying a real kit (including Como).
**Register**: Mute. No host, no voiceover, no peer-to-camera. The picture carries the sentence. App chrome (lockup, “Tryk for at fortsætte”, Login / Opret konto) owns copy on splash.

## Language

Status: `locked`

**Spoken**: None. No voice, no SFX-as-speech, no music briefed as a claim-carrier. Generate muted; splash playback is `muted`.
**On-screen text**: None burned into pixels on splash loops (no captions, no scoreboard, no club names, no DKK, no “Samling” title card). Danish collector chrome stays in the app, not in the file.
**Override note**: Every brief states **mute, no burned captions**. Do not use UGC or faceless workflows for splash — they default to American-accented English and burned subtitles. If a later video ever needs speech, that is a new lock decision, not an override of this format.

## Claims

Status: `locked` (visual only — no wording in the file)

| Claim | Allowed wording | Evidence |
| --- | --- | --- |
| Football passion lives in the shirt that remains | Visual only: play → shirt off → rail | PRD: visual collection on the phone; not a marketplace |
| KitCollective is the chest mark | KC lockup or monogram as sole sponsor | Logo foundation; fictional prize kits |

**Off limits**: Market prices or economic value (PRD Non-Goals). User counts, “best”, authenticity guarantees, authenticity checks, IAP price, competitor names. Real club names, crests, lookalike full kits, manufacturer marks (Nike/Adidas/Puma, Trefoil, Three Stripes). Archive KitPhoto. Invented catalog Marks (shields). Confetti / bounce celebration (design-system Motion). Green or multi-accent “fun” palettes (owner rejected).

**Legal and consent**: No real club, league, or tournament IP. Fictional kits: KitCollective lockup or monogram as the only chest mark (`#0A0A0A` or `#FFFFFF`); no fake crests. Generated adults; faces allowed; **no celebrity lookalikes**. Counsel before public merch of the prize kits. Not legal advice.

## Persona

Status: `locked`

**Default creator**: Generated adult footballers in the prize kits — showtime athletes, not influencers. Faces may show. No celebrity lookalikes, no named real players. The shirt stays the product hero; faces are the match, not the brand.
**Consent**: Generated adults only until a named person is supplied with consent in this file.
**Setting**: Floodlit cage / small-sided court as a stage. Two stilren sides: **white** (Como-grammar: clean white, quiet tonal body, restrained navy collar/cuff — not a replica) vs **black** (same grammar, KC universe). KC mark is the only chest sponsor. No manufacturer logos.
**Continuity**: No approved creator media ids yet. Kit stills, once generated, are the continuity lock for later shots.

## Product on screen

Status: `locked`

**What the viewer sees**: Fictional prize kits in play, then the same shirts on a **rail / ophæng** — collector overview, not Samling chrome, not a 4:5 tile slam. No Expo screenshots. No burned app chrome (lockup + dock sit on top in the client).
**Screenshot source**: None for splash-play-to-grid.
**Never on screen**: Real UserJersey photos; seeded catalog KitPhoto; admin; paywall; bid amounts; real club kits; burned UI; app grid tiles.
**Mobile composition**: 9:16 **full-bleed cover** on a phone. Compressed: bodies and shirts fill the frame (torso-up, shirt-large). No cinema-wide masters with tiny players. Safe zones for client chrome: **centre** darker and less busy (white lockup + “Tryk for at fortsætte”); **bottom** clear of faces (Login / Opret dock). Action lives in the upper half and the edges.

## Formats

Status: `locked` for splash. Other placements deferred.

| Placement | Aspect | Duration | Captions |
| --- | --- | --- | --- |
| First-session splash background (unsigned launch, behind lockup + dock) | 9:16 | **10 s** loop, first frame = last frame | None. Mute. |

**Defaults**: 9:16 full-bleed cover, mute, no burned text, 10 s seamless loop. Reduce Motion uses the first frame as a still on `fill.primary`. Darker centre plate so white lockup reads (design-system Logo: no lockup on a busy jersey without a dark layer). Showtime lighting in the *scene* does not blow out the canvas behind the lockup — client scrim stays.

## Verdict log

| Date | Slug | Workflow | Held | Drifted | Lock change |
| --- | --- | --- | --- | --- | --- |

## Using this file

1. Read Voice, Language, and Claims before writing any brief.
2. Choose from the locked claims, persona, and formats. Compose; do not extend.
3. A video that needs a decision this file does not carry: **flag it** and lock it with the owner.
4. Workflow-pinned craft (models, prompt wording, densities) belongs to Higgsfield, never to this file.

## Deferred

| Area | Why now | Revisit when |
| --- | --- | --- |
| Spoken Danish ads / App Preview with audio | Owner locked no sound | A later brief explicitly asks for voice |
| Copy-led story film | Splash is the mute loop | Video two |
| Wishlist “empty tile” story | Owner chose play → shirt → rail as A | `.scratch/video/` for a second slug |
| Motion-lock gap in `docs/design-system.md` | Video lock is not the design-system gap | `/to-design` before the loop ships in Expo |
| Higgsfield spend | Session expired 2026-09-05; no go yet | Re-authorize connector + explicit go |
