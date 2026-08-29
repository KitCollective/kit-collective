# Claude prompt — Profil hi-fi (KitCollective)

Paste **this entire file** into a fresh Claude Design / Artifacts session.
Attach **every PNG in this folder** (01–14). Optionally also attach Samling chrome: `.scratch/collection-main-screen/claude-design/KitCollective-samling-og-genveje-3a.html`.

**Do not copy the Expo prototype as the lock.** The PNGs are **IA / wireframe only**. Redraw to the visual lock below. Ignore: debug lines like `eskou · København, dk · da · system · cookies unset`; grey side gutters; empty jersey squares (draw real-looking collector photos). No prototype switcher in the output.

---

You are designing **KitCollective**, a Nordic football-shirt collector app.

This is **not** a marketplace. This is **not** Shirt Squad. This is **not** Vinted sell / buy / boost / teal CTA. Taste may steal Vinted **scanability** (grouped list, short captions, drill-down) only.

## Authority (in this order)

1. Product nouns: **Collector** (Expo user). **UserJersey** (owned copy of a shirt, with photos). **Kit** (catalog design — club / season / type — not the owned copy). **Profil** is the collector place. Settings live **under** Profil, not as their own tab.
2. Visual lock: `docs/design-system.md` (apply; do not invent tokens).
3. This brief. Attached PNGs are IA only.

## Visual lock — non-negotiable

**Taste:** Vinted for layout/scan. Uber Base for grayscale structure and quiet motion. One cyan→violet **identity wash** as garnish only (thin strip / low-opacity), never as chrome, never as CTA, never behind a jersey photo, never as success/warning/info.

**Anti-references:** Shirt Squad wizards. Vinted teal primary. Newbie palettes. Emoji as icons. Invented crests. Archive kit JPEGs as club marks. Fantasy gradient fills behind photos. Price / buy / boost / ratings on cards.

**Type (load these families; system-ui is fallback only):**
- Headings: **Archivo** 600. Screen title **Profil** / **Indstillinger** = `title` 24/29, tracking −2%. Username on the identity card = `heading-sm` 15/20.
- Body, labels, buttons: **IBM Plex Sans** 400/500. Body 16/25. Button label 16/20 medium.
- Season · type · location meta · counts: **IBM Plex Mono** 14/20 (or 13/18). Never body paragraphs in Mono. Never headings in Plex Sans.

**Color (light default; dark follows system — same roles, inverted fills):**
- Canvas/surface `#FFFFFF`. Content primary black. Secondary `#5E5E5E`. Muted `#6B6B6B`. Border `#E8E8E8`. Fill secondary `#F4F4F4`.
- Primary CTA = **black fill, white text**. Not cyan. Not teal.
- Danger `#B42318` for Log ud / Slet min konto — never the only signal (icon + text).
- Wash `#00D4F5` → `#6B2FFF` is garnish, not a button.

**Radius:** buttons `8`. cards `12`. sheets `16`. tab pill `999`.
**Space:** inset 8 / 16 / 24. Gap 8 / 12 / 16.
**Hit targets:** ≥ 44×44. WCAG AA. `prefers-reduced-motion` = no travel, opacity only.
**Motion:** 200ms press, 300ms push/pop. Opacity + transform only. No bounce.
**Copy:** Danish UI. English only in your rationale captions. Catalog names stay Danish (F.C. København, Hjemme, Ude).
**Marks:** Initial monogram on `fill.secondary` if no photo. Never ⚽.
**Jersey photos:** collector photos, cropped **4:5**. Chrome stays grayscale around them.

**Tab bar (locked chrome):**
- Floating **icon-only glass pill**. Five slots: House **Samling** · Compass **Søg** · raised plus **Tilføj trøje** · envelope **Indbakke** · Person **Profil** (selected on Profil home).
- **Hide the tab bar** on every drill screen (02–05, 07–14). Visible on **01 Profil home**. On **06 Favoritter**: hide (it is a drill).
- Plus starts capture, never compose-a-listing.

## Product decisions already made (do not reopen)

- **IA = list + drill** (variant A). Not a hero canvas. Not a one-page control center. Follow the PNG stack order.
- Profil home: identity card (avatar, unique **username**, city line, **Rediger profil**). Then **Favoritter**. Then **Indstillinger** and **Cookie-indstillinger**. No “view my listings”. No balance, orders, donations, holiday mode, payments, postage, security, help, about.
- Username is unique and follows the collector around. Helper on edit: dit / ledigt / optaget.
- **Min lokation:** country list → city Search field + **Populære byer**. If the typed name is not in the list, row **Brug «…»** + caption “Ingen by i listen — gem som frit tag”. No map. No Google Places chrome.
- Favourites are other collectors’ **UserJerseys** (club `heading-sm`, season · type `mono`).
- Settings hub: **Profiloplysninger**, **Kontoindstillinger**, Push, E-mail, Sprog (meta = current), Mørk tilstand (meta = Systemindstilling / Lys / Mørk), Privatlivsindstillinger, **Log ud**.
- Cookies: necessary always on (not a switch); Analyse and Marketing as choices; **Acceptér alle** (primary) / **Kun nødvendige** (secondary) / **Bekræft mine valg** (tertiary). Must look like a working preference.
- Account: email + phone as login-only (phone never public, never marketing). Full name. Facebook/Google status. Skift adgangskode. Slet min konto destructive — confirm in a Sheet, no wizard.
- Push: høj prioritet (Nye beskeder, Bud på mine trøjer), øvrige (Opdateringer på favoritter), daglig grænse as a row, master **Slå push til**.
- Privacy: personligt indhold, nyligt sete på forsiden, giv besked når jeg favoritterer, administrer kontodata.

## Screens to draw (phone 390×844, light)

Steal **structure and Danish copy** from the matching PNG. Redraw tokens, type, 4:5 photos, glass pill.

| # | File | Draw this |
|---|---|---|
| 1 | `01-home.png` | Profil home. Identity card. Favoritter (count). Indstillinger. Cookie-indstillinger. Glass pill, person selected. Last rows clear the pill. **No debug line.** |
| 2 | `02-edit-profile.png` | Rediger profil. Close + **Gem**. Skift foto. Brugernavn + uniqueness helper. Om mig. Min lokation. Vis by på profil (proposed Switch — see gaps). No tab bar. |
| 3 | `03-location-country.png` | Min lokation — countries. Danmark first. Chevron drill. No tab bar. |
| 4 | `04-location-city.png` | Search “Søg efter by”. Section **Populære byer · Danmark**. Five cities. |
| 5 | `05-location-city-tag.png` | Same screen, query Horsens. Row **Brug «Horsens»** + free-tag caption. |
| 6 | `06-favorites.png` | Two-column 4:5 tiles. Real-looking jersey photos, not grey squares. Club + season · type. |
| 7 | `07-settings.png` | Indstillinger hub. Grouped list. Sprog meta **Dansk**. Mørk tilstand meta **Systemindstilling**. |
| 8 | `08-account.png` | Kontoindstillinger. Close + Gem. Kontakt, personlige oplysninger, tilknyttede konti, skift adgangskode, slet min konto (danger). |
| 9 | `09-push.png` | Push-notifikationer. Sections + proposed Switches. Daily limit row. Master at bottom. |
| 10 | `10-email.png` | E-mail-notifikationer. Nyheder off by default. Høj prioritet on. |
| 11 | `11-privacy.png` | Privatlivsindstillinger. Three toggles + administrer kontodata row. |
| 12 | `12-logout.png` | Log ud. Short consequence sentence. Destructive **Log ud**. Tertiary **Annuller**. (A Sheet is also acceptable if it matches lock Sheet `confirm` — pick one and stay consistent.) |
| 13 | `13-language.png` | Sprog list. Dansk = Valgt. EN / Svenska / Norsk. |
| 14 | `14-cookies.png` | Mine præferencer. About-copy short. Nødvendige always active. Analyse / Marketing. Button dock: Acceptér alle, Kun nødvendige, Bekræft mine valg. |

Optional extra: screen 1 also in **dark** token mode (not a third palette). Optional: Mørk tilstand list (System / Lys / Mørk) as a 15th frame if it stays the same list pattern as 13.

## Density and polish

Low fill. No switcher. No `state:` dump. No emoji. Danish copy. Grouped lists on `fill.secondary` canvas, `surface` groups, hairline `border.subtle`.

**Motion (one sentence per frame):** list → drill fade (`motion.base`). Reduced-motion = instant.

## Produce

Hi-fi phone frames for 1–14. Danish UI. Token-faithful grayscale. One short rationale note listing **gaps you flagged**.

## Flag, do not invent

- **Switch** is deferred in the lock. Settings need on/off. Draw one proposed Switch (track + thumb, grayscale, ≥ 44 hit) and label the frame “gap: Switch not in inventory”. No teal track. No checkbox.
- **User avatar** is deferred. Circular photo / monogram still required. Label “gap: user avatar primitive”. Do not use the KC monogram as the collector avatar.
- List row `navigate` was “settings later”. This job is that later — use List row.
- Live geocoding vs fixture cities (out of this job).
- Cookie legal copy (keep the three actions; do not write a privacy policy).
- Any new color, type size, or component name not in this brief.
