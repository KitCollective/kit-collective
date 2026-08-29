# Claude prompt — Indbakke hi-fi (KitCollective)

Paste this into a **fresh** Claude Design / Artifacts session. Attach the PNGs in **this folder**. Attach Samling 3a HTML if you have it.

**Do not copy the Expo prototype as the lock.** It is a throwaway flow sketch. Redraw to the visual lock below. Ignore any black “C — …” switcher pill, debug state lines, and “Simulér bud” demo buttons if they appear in a screenshot.

---

You are designing **KitCollective**, a Nordic football-shirt collector app.

This is **not** a marketplace. This is **not** Shirt Squad. This is **not** Vinted sell / buy / boost / teal CTA. Taste may steal Vinted **scanability** (list density, short captions, tabs) only.

## Authority (in this order)

1. Product nouns: **Collector** (Expo user). **UserJersey** (their owned copy of a shirt, with photos). **Kit** (catalog design — club / season / type — not the owned copy). **Indbakke** (collector-to-collector messages). A **bud** is a message about a UserJersey the owner has allowed bidding on — it creates a thread. It is **not** checkout, payment, or a listing price on Samling tiles.
2. Visual lock (apply; do not invent tokens): `docs/design-system.md`.
3. This brief. Prototype IA is subordinate.

## Visual lock — non-negotiable

**Taste:** Vinted for layout/scan. Uber Base for grayscale structure and quiet motion. One cyan→violet **identity wash** as garnish only (thin strip / low-opacity), never as chrome, never as CTA, never behind a jersey photo, never as success/warning/info.

**Anti-references:** Shirt Squad wizards. Vinted teal primary. Newbie palettes. Emoji as icons. Invented crests. Archive kit JPEGs as club marks. Fantasy gradient fills behind photos. Price / buy / boost / ratings on collection cards.

**Type (load these families; system-ui is fallback only):**
- Headings: **Archivo** 600. Screen title **Indbakke** = `title` 24/29, tracking −2%. Club on a tile = `heading-sm` 15/20.
- Body, labels, buttons: **IBM Plex Sans** 400/500. Body 16/25. Button label 16/20 medium.
- Season · type · time · counts: **IBM Plex Mono** 14/20 (or 13/18). Never body paragraphs in Mono. Never headings in Plex Sans.

**Color (light default; dark follows system — same roles, inverted fills):**
- Canvas/surface white (`#FFFFFF`). Content primary black. Secondary `#5E5E5E`. Muted `#6B6B6B`. Border `#E8E8E8`. Fill secondary `#F4F4F4`.
- Primary CTA = **black fill, white text** (dark mode: white fill, black text). Not cyan. Not teal. Not `#1F5EFF`.
- Danger `#B42318` for Rapportér / Blokér / Slet — never the only signal (icon + text).
- Status colors are functional only. Wash `#00D4F5` → `#6B2FFF` is garnish, not a button.

**Radius:** buttons `8`. cards/bubbles `12`. sheets `16`. tab pill `999`.
**Space:** inset 8 / 16 / 24. Gap 8 / 12 / 16.
**Hit targets:** ≥ 44×44. WCAG AA. `prefers-reduced-motion` = no travel, opacity only.
**Motion:** 200ms press, 300ms sheet/tab. Opacity + transform only. No bounce, no confetti.
**Copy:** Danish UI. English only in your rationale captions. Catalog names stay Danish (FC København, Hjemme, Ude) — never English seed strings as the UI label.
**Marks:** Initial monogram on `fill.secondary` if no photo. Never ⚽, never a made-up badge.
**Jersey photos:** collector photos, cropped **4:5** when shown as a product image. Chrome stays grayscale around them.

**Tab bar (locked chrome, this gap changes slot 4 only):**
- Floating **icon-only glass pill** above the home indicator. Not a labeled dock. Not flush to the screen edge.
- Five slots: House **Samling** · Compass **Søg** · raised plus **Tilføj trøje** (black circle, still inside the pill) · **slot 4 = Indbakke (envelope)** · Person **Profil**.
- Slot 4 **replaces** the locked Heart / Ønske place. Do not draw a heart. Do not design wishlist content in this job. Ønske is out of scope.
- Plus starts capture, never compose-a-listing, never “ny genvej”.
- Unselected icons `content.muted`. Selected `content.primary`. No wash in the pill.
- **Lock conflict — flag, do not silently ignore:** the written lock says notification badges live on the Samling header bell, not on a tab. Unread **must** be visible on the thread row (background `fill.secondary` and/or stronger snippet). If you show a count on the envelope, draw it as **one proposed option** and label the frame “gap: tab badge vs bell”. Prefer the row signal as the default.

## Product decisions already made (do not reopen)

- **IA = variant C:** Indbakke has two top tabs under the title: **Beskeder** | **Aktivitet**. Underline/selected = black hairline, not teal.
- **Beskeder** = conversation threads (person + snippet + time).
- **Aktivitet** = bid/events as cards (not a second chat list). Tap a card opens the thread.
- **Chat alignment (locked):** **left = modtager** (the other collector). **Right = afsender** (me). System/timeline lines centered. Incoming bubble `fill.secondary`. Outgoing bubble `fill.primary` + inverse text.
- Composer at the bottom: attach image, text field, send. Reply-to is a one-line quote above the field, dismissible.
- A **bud** is a **timeline card in the thread** (amount + Afventer / Accepteret / Afvist). Incoming pending bud: **Accepter** (primary black) + **Afvis** (secondary). No payment sheet. No “køb nu”.
- **Detaljer** (from header info / overflow): other collector row → profile stub. Then **Rapportér**, **Blokér**, **Slet samtale**. No Help.
- Tab bar: **hide on the conversation and Detaljer** (phone). Visible on Indbakke list. Plus is not a selected tab.
- Starting a bud happens on **someone else’s UserJersey** (e.g. from Søg / their collection), not as price chrome on **my** Samling tiles.

## Screens to draw (phone 390×844)

1. **Indbakke — Beskeder** — Title `Indbakke`. Tabs Beskeder (active) | Aktivitet. Thread rows: monogram, handle (`heading-sm`), snippet (`caption` / secondary), time (`mono` or caption). One unread row. Glass pill with envelope selected. Last rows clear the pill.
2. **Indbakke — Aktivitet** — Same chrome. Cards: “Nyt bud på din trøje” + club · season · type in `mono` + amount in the **body of the card**, not as a Samling tile overlay. Tap affordance obvious.
3. **Samtale** — Back, handle (center), overflow/info. Optional one-line jersey context (`mono`: club · season · type), not a marketplace header. Thread: left/right as locked. One incoming **bud-kort**. One photo bubble. Composer. No tab bar.
4. **Detaljer** — Grouped lists on `fill.secondary` canvas, `surface` groups, `radius.md`. Profile row. Rapportér / Blokér. Slet samtale alone. Destructive in `danger`.
5. **Send bud** — Someone else’s UserJersey (4:5 photo, club, season · type, owner handle). Amount field. Primary **Send bud**. Caption: ejeren får en besked i Indbakke. Not a cart. Not Vinted “Buy now”.
6. **Tom Indbakke** — Honest empty: title `section`, body one sentence, no fake threads, no illustration library.

Optional extra: one **wide** frame (e.g. 1024) of Beskeder list left + samtale right — same tokens, no new desktop product. If you skip it, say so.

Light for all six. Optional: screen 3 also in **dark** token mode (not a third palette).

## Density and polish

Low fill. No prototype switcher. No `state:` dump. No debug. No emoji. Real-looking jersey photos, not colored squares. Danish copy.

**Motion (one sentence per frame):** tab underline, list → thread fade (`motion.base`), sheet if any. Reduced-motion = instant.

## Produce

Hi-fi phone frames for 1–6. Danish UI. Token-faithful grayscale. One short rationale note listing **gaps you flagged** (tab badge, Ønske displacement, where Send bud lives if not Søg).

## Flag, do not invent

- Android vs iOS composer / keyboard.
- Whether Aktivitet and Beskeder share one unread model.
- Profile depth (this gap = handle + jersey count stub).
- Where Ønske goes after the heart slot is gone (out of this job).
- Any new color, type size, or component name not in this brief.

---

## Attach if you have them

| File | Why |
| --- | --- |
| `KitCollective-samling-og-genveje-3a.html` | Locked Samling chrome + glass pill (`.scratch/collection-main-screen/claude-design/`) |
| This prompt | The job |

## Attached wireframes (IA only — this folder)

Ignore the prototype switcher, “Simulér bud”, and “Byd på AGF” demo chrome if they appear. Steal flow and hierarchy, not colour swatches.

| File | Screen |
| --- | --- |
| `01-beskeder.png` | Indbakke · Beskeder list + glass pill (envelope, unread badge) |
| `02-aktivitet.png` | Indbakke · Aktivitet cards (bud / svar) |
| `03-samtale-bud.png` | Samtale with incoming **bud-kort** (Accepter / Afvis), left = modtager |
| `03b-samtale-venstre-hojre.png` | Samtale with **left = them, right = me** (text + foto) |
| `04-detaljer.png` | Detaljer: profil, Rapportér, Blokér, Slet samtale |
| `05-send-bud.png` | Send bud on someone else’s UserJersey |
