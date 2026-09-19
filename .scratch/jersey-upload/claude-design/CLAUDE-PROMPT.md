# Claude prompt — Tilføj trøje hi-fi (KitCollective)

Paste this into Claude Design / Artifacts. Attach the PNGs in this folder. **Do not copy the Expo prototype as the lock.** It is a throwaway flow sketch. Redraw to `docs/design-system.md`. Ignore the prototype banner and the floating “D — …” switcher bar if they appear in a screenshot.

---

You are designing **KitCollective**, a Nordic football-shirt collector app (not a marketplace, not Shirt Squad, not Vinted sell-flow).

**Authority (in this order):**
1. Product nouns in CONTEXT.md: **UserJersey** (owned copy), **Kit** (catalog design), **Vision suggestion** (Gemini output; persist catalog UUIDs after confirm), **Save** must not wait on Vision.
2. Visual lock: `docs/design-system.md` — Archivo headings, IBM Plex Sans body/labels, IBM Plex Mono season. Grayscale chrome. Primary Save is **black**. No “AI purple”. Jersey photos 4:5. Photo roles in domain: **front | back | label** (Danish: Forside, Bagside, Mærke). Floating glass tab bar; raised plus is **Tilføj trøje**.
3. This brief + the attached lo-fi screenshots (flow evidence only).

**Locked capture decisions (do not reopen):**
- Plus → two paths. **Primary: Upload filer** (system picker: iOS Photos **and** Files / Android gallery **and** documents). **Secondary: Tag billede** (in-app camera on repeat; gallery-first still true for first session).
- Multi-select is **numbered** like iOS Photos (`orderedSelection`). Tap order is the sequence. Do **not** invent a custom in-app camera roll as the product picker.
- **Vision does not group photos into UserJerseys.** Research: on-device CV is not equally good; pick-order + human bind is the grouping model. Vision only suggests **club / season / kit type** on the jersey the collector is actually filling. Fail-open; Save never waits. Suggestions fade in (`motion.fast`). No blocking “analysing 20 photos” screen.
- **Do not** auto-chunk every three photos as a jersey.
- Photo roles stay three slots. Left/right/other is **not** a required slot.
- Danish UI. English only in your rationale captions.

**UX to draw (steal from the lo-fi, not the colour swatches):**

1. **Chooser** (`01-chooser.png`) — After plus. Title **Tilføj trøje** (singular is OK if one path; bulk is the same entry). Primary button **Upload filer**. Secondary **Tag billede**. One short caption: few photos = one jersey; many = uredigeret række you bind to tabs. Vision guesses club, not groups. Quiet helper about Photos vs Files. Keep chrome thin.

2. **System picker** (`02-picker.png` is a fake grid) — Do **not** hi-fi our fake library. Draw a recognisable **iOS Photos** multi-select with numbered badges 1, 2, 3… plus a control to switch to **Filer**. Android: system picker, no iOS badges required. Confirm: **Brug n billeder**.

3. **One UserJersey confirm** (`03-single-confirm.png`) — One confirm screen, not a wizard. 4:5 photo strip with role captions. Club Search field, club-scoped season, chips Hjemme/Ude/Tredje (type/size/condition as in the design system). Vision rail: in-flight then “forslag klar”; collector can type the whole time. Primary **Gem**. Text link **Flere trøjer i denne upload** (escape to bulk without re-picking). Nameset/purchase behind **Flere detaljer**.

4. **Saved** (`04-saved.png`) — Clear ✓ **Gemt**. One sentence. Primary **Ny trøje** or back to Samling. No confetti. Existing post-save “same club / new jersey” may appear as a sheet — do not invent a third product.

5. **Bulk — uredigerede empty groups** (`05-bulk-unbound.png`) — Horizontal **Uredigerede** series (count only, no essay). Jersey **tabs** (Trøje 1 · n, **+ trøje**). Active tab = drop target. Short line: select tab, tap (or drag) uredigerede. **No AI grouping.** Club/season empty until photos sit on that jersey. **Gem** disabled until the active jersey has photos + club + season.

6. **Bulk — some bound** (`06-bulk-bound.png`) — Uredigerede shrinks as photos move. Active jersey shows Forside/Bagside/Mærke thumbs (tap a bound thumb returns it to uredigerede). Vision rail only for **stamdata** on that jersey (“Gem venter ikke”). When more than one unsaved jersey: primary **Gem og næste**. When uredigerede is empty, **hide the whole unbound row** so the screen is not empty chrome.

**Density:** Low fill. No debug `state:` line. No second AI panel. Tab bar may be hidden during capture (plus already started the flow) or shown inactive — pick one and stay consistent; plus is not a selected tab.

**Motion (one sentence per frame):** opacity/transform only. Vision fade-in. Unbound row collapse when empty. No bounce.

**Produce:** Phone frames (390×844) for screens 1, 3, 4, 5, 6, plus one iOS Photos picker frame (2). Optional: Vision **in flight** vs **ready** as two states of screen 3. Danish copy. Token-faithful grayscale. Real-looking jersey photos, not coloured squares.

**Flag gaps:** Android picker chrome; whether capture hides the glass tab bar; max photos per session.

---

## Attached files

| File | Screen |
| --- | --- |
| `01-chooser.png` | Plus → Upload filer / Tag billede |
| `02-picker.png` | Fake numbered multi-select (redraw as OS picker) |
| `03-single-confirm.png` | One jersey confirm + Vision stamdata |
| `04-saved.png` | Gemt |
| `05-bulk-unbound.png` | Six uredigerede, empty Trøje 1 |
| `06-bulk-bound.png` | Three bound, three still uredigerede |
