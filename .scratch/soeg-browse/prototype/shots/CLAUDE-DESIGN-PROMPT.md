# Claude Design prompt — KitCollective browse surfaces

**Use:** Paste this into Claude Design / Artifacts with the three PNGs attached (order below).  
**Goal:** Hi-fi frames that match KitCollective’s locked grayscale system — polish the wire-level prototypes into production-ready mobile UI (not a redesign of IA).

---

## Attach these images (in order)

1. `01-soeg-magazine.png` — **Søg** home (magazine shelves)  
2. `02-jersey-detail-own-foreign.png` — **UserJersey detail** own (left) + foreign (right), immersive pager + bottom sheet  
3. `03-peer-profil.png` — **Peer Profil** identity card + 2-column jersey grid  

Path on disk:  
`.scratch/soeg-browse/prototype/shots/`

---

## Prompt (copy from here)

```text
You are designing hi-fi mobile UI for KitCollective — a Nordic football-shirt collector app (Danish UI copy). I attached three prototype screenshots that define the WINNING layouts. Do NOT invent a new information architecture. Elevate these into production hi-fi that match our design system.

PRODUCT CONTEXT
- Collectors register owned shirts (UserJersey), browse others, message bids (Bud). Not a marketplace with prices on tiles.
- Surfaces in these frames: Søg (search/discover tab), UserJersey detail (own vs foreign), Peer Profil (another collector).
- Entitlement / paywall is OUT OF SCOPE here. Søg browse is free.

DESIGN SYSTEM (hard constraints)
- Taste: Vinted-like scanability + Uber Base grayscale. Black / white / gray hierarchy. ONE cyan→violet identity wash exists but is GARNISH ONLY — never behind jersey photos, never as primary CTA, never as status color.
- Primary buttons: black fill, white label (light mode).
- Type: Archivo for titles/headings; IBM Plex Sans for body; IBM Plex Mono for season · type · counts · handles meta.
- Jersey photos: 4:5 crop, rounded ~12px. Placeholder gradients OK if you mark them as photo slots — never invent club crests as emoji or fake shields; use monogram Marks (FCK, BIF) on gray tiles when no crest.
- Floating icon-only glass tab bar (5 slots): Samling · Søg · Tilføj (+) · Indbakke · Profil. Visible on Søg home; HIDDEN on UserJersey detail and Peer Profil.
- No marketplace chrome: no price, buy, boost, or ratings on jersey tiles. Bid amounts only belong on Send bud / inbox — not overlays on photos.
- Danish copy only on collector chrome.
- Hit targets ≥ 44px. Light mode first (also show dark variants if easy — same structure).

FRAME 1 — Søg home (image 1)
IA locked as a “magazine”:
1. Title “Søg”
2. Search field (pill) — placeholder like “Klub, trøje, spiller eller samler”
3. Shelf “Klubber” — horizontal Mark scroll
4. Shelf “Åbne for bud” — horizontal 4:5 jersey tiles (ONLY place that signals bidding on this home — no “Bud” badges on the grid below)
5. Shelf “Samlere” — horizontal avatars + handles
6. Shelf “Flere trøjer” — 2-column jersey grid
Hide empty shelves in real product; show all four populated in the hi-fi.
Tab bar visible with Søg/compass selected.
Replace placeholder icons with a coherent SF-Symbol-like set (house, compass, plus, envelope, person) — still icon-only.

FRAME 2 — UserJersey detail (image 2)
IA locked as immersive photo pager + bottom sheet (NOT a scrolling hero+strip page).
Show TWO phones side by side labeled Own | Foreign (as in the attach):
Shared:
- Full-bleed 4:5 photo stage, pager dots, back control over the photo
- Bottom sheet with club title + mono “season · type · size · condition”
Own sheet:
- Switches: Privat | Åben for bud (Privat on forces bud off)
- Secondary “Rediger”, destructive text “Slet”
Foreign sheet:
- Favorit + overflow (⋯) in top chrome over photo
- Owner row (avatar + handle) → Peer Profil
- Primary “Send bud” when open for bids
No amount field on this screen. No tab bar.

FRAME 3 — Peer Profil (image 3)
IA locked as identity card + 2-column grid:
- Back, title “Profil”, overflow ⋯ (Rapportér / Blokér)
- Card: Avatar, handle, location mono, About text
- Section “Trøjer · N”
- 2-col 4:5 jersey tiles with club + season·type captions
- No settings, no Rediger, no their Favoritter
- No tab bar

DELIVERABLES
1. Hi-fi of Frame 1 (Søg) — light mode, phone 390×844
2. Hi-fi of Frame 2 (Own + Foreign detail) — light mode, side by side
3. Hi-fi of Frame 3 (Peer Profil) — light mode
4. Optional: same three in dark mode (grayscale only — no new palette)
5. A short annotation layer OR caption list: component names you used (Search field, Jersey tile, Avatar, Switch, bottom sheet, Tab bar)

DO NOT
- Rename Søg to “Discovery”
- Add Trøjer | Katalog | Samlere tabs on Søg home
- Put prices or Bud badges on Flere trøjer tiles
- Copy Vinted sell/boost chrome
- Use teal / purple primary CTAs
- Use Kit archive photos as club logos
- Invent a sixth tab or wishlist heart in the tab bar

Treat the attached screenshots as structural truth; improve typography, spacing, real photo placeholders, icon quality, and sheet elevation — keep the same regions and hierarchy.
```

---

## Notes for you

- Screenshots are throwaway wire-fi (gradient photo slots, emoji-ish tab glyphs). Claude Design should replace those with real photo placeholders and proper icons.
- After Claude Design returns frames, drop them under e.g. `.scratch/soeg-browse/claude-design/` and point `docs/design-system.md` Evidence at them (same pattern as Indbakke / Profil gaps).
- Then continue factory with `/to-spec`.
