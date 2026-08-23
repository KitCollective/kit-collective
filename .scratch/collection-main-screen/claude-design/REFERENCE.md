# Collection main screen — design reference

**Status:** Human + Claude chose **3a** (light glass pill). Visual source of truth is the artifact, not the Expo prototype.

**Artifact:** `KitCollective-samling-og-genveje-3a.html` (open in a browser).  
**Wireframe captures (pre-HiFi):** `01-samling-gitter.png` … `13-notifikationer.png` — IA only.

**Brand book:** `KitCollective-brand-book-v1.html` (v1.0, August 2026). Source for **type families, type scale, and logo construction**. Not a screen lock — its in-book app mock still shows kit-type chips, labeled tabs, and a wordmark header. **3a** wins on Samling chrome and genveje.

**Type (from brand book §06, to fold in `/to-design`):** Archivo for headings and logo. IBM Plex Sans for body, labels, buttons. IBM Plex Mono for season, size, IDs, counts. Scale: display 32 · title 24 · section 20 · body 16 · body-s 15 · label 13 · caption 12 · mono 14.

**Logo (from brand book §01–04):** Wordmark Archivo Kit 400 / Collective 600. Mark: square KC 700. Compact wordmark for app chrome *when a screen uses a wordmark*. 3a collection header is **Samling + count**, not the wordmark.

**Do not take from the brand book into this gap:** example Hjemme/Ude chips, labeled five-tab bar, profile in header, accent `#1F5EFF` as button fill (primary CTA stays black; jersey photo carries colour).

**Chosen chrome (3a):** Icon-only floating glass pill. Places: home (Samling), compass (Søg), raised plus (capture), heart (Ønske), person (Profil). Header: title + collection count + bell. Search is the Søg tab, not the collection header.

**Chosen collection + shortcuts:** Two-column 4:5 grid. Chips are user **genveje** (country / league / club / player AND), not kit type. Alle is default. Tilpas opens a **Sheet** manager (not a full-screen place). Facets use select fields → fullscreen searchable picker. Optional custom name; else auto-name from facets. Empty collection hides chips. After Gem, Alle stays selected.

Throwaway prototype branch: `prototype/collection-main-screen`. Do not `/land` it.
