# Claude Design — Søg, trøjedetalje, Peer Profil

**Source:** Claude Design export from prototype winners (Søg **C**, detail **B**, Peer **A**).  
**File:** `KitCollective-soeg-og-troejer.html` (bundled; open in a browser).  
**Overview shot:** `overview.png`

## Frames (as labeled in the HTML)

| ID | Screen | Notes |
| --- | --- | --- |
| **6a** | Søg · magasin | Shelves: Klubber → Åbne for bud → Samlere → Flere trøjer; search pill; tab bar |
| **6b** | Trøjedetalje own \| foreign | Immersive pager + bottom sheet; Privat/bud vs Send bud |
| **6c** | Peer-profil | Identity card + Trøjer · N 2-col grid |
| **6d** | Dark variants | Same IA; invert primary (white on dark) |

## Vs design lock

**Aligned:** Magazine IA, immersive detail + sheet, Peer card+grid, grayscale, 4:5 slots, Danish copy, no price on tiles, Send bud without amount on detail, tab bar on Søg / hidden on detail & Peer.

**Flag before implement (do not invent in code):**
- Dark canvas hex in the artifact (`#0E0E0E` / `#1A1A1A`) — product dark tokens stay in `docs/design-system.md` / `tokens.ts`; do not copy artifact hex as new tokens.
- Tab bar glyph set in the hi-fi — host must use the locked icon family; flag if glyphs diverge.
- Exact Peer title (“Profil” vs handle) still flagged in the lock.

## Factory next

`/to-spec` against KitCollective with milestones: (1) Private + UserJersey detail, (2) Peer Profil, (3) Søg + drills. Visual contract = this file + `docs/design-system.md` Gap 2026-08-31 patterns.
