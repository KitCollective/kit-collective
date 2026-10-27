# E-mail images

Served by `GET /v1/email/assets/:file` (`apps/api/src/notify/email-assets.controller.ts`) with
`Cache-Control: public, max-age=31536000, immutable`. Only the names in `src/notify/assets.ts`
(`EMAIL_ASSET_FILES`) are served; any other name is a 404.

Exported on 2026-10-28 from the Paper file "KitCollective App", page `09 E-mail`, as @2x PNGs.
Do not redraw them (`docs/design-system.md` → Transactional e-mail → Gaps).

| File | Pixels (@2x) | From Paper |
| --- | --- | --- |
| `lockup-light.v1.png`, `lockup-dark.v1.png` | 289 × 56 | `Lys / 01` and `Mørk / 01` → Lockup, trimmed to the drawn mark and wordmark (the frame is full width in Paper) |
| `board-1-{light,dark}.v1.png` | 580 × 540 | `Lys / 05`, `Mørk / 05` → Taktiktavle (1 Angreb) |
| `board-2-{light,dark}.v1.png` | 580 × 540 | `Lys / 01`, `Mørk / 01` → Taktiktavle (2 Midtbane) |
| `board-3-{light,dark}.v1.png` | 580 × 540 | `Lys / 09`, `Mørk / 09` → Taktiktavle (3 Hjørnespark) |
| `board-{1,2,3}-light-phone.v1.png` | 320 × 298 | `Telefon / 05`, `/ 01`, `/ 09` → Taktiktavle (160 × 149) |
| `board-{1,2,3}-dark-phone.v1.png` | 320 × 298 | The dark desktop board at 160 wide: Paper has no dark phone artboards; the drawing is the same at both sizes |
| `edge-{light,dark}-600.v1.png` | 1200 × 132 | The bottom band of `Lys / 01` and `Mørk / 01` → Top: field colour above, canvas ellipse below, board and text removed |
| `edge-light-375.v1.png` | 750 × 121 | The same band of `Telefon / 01` → Top |
| `edge-dark-375.v1.png` | 750 × 121 | The phone curve in the dark field and canvas colours (no dark phone artboard in Paper) |

Boards have a transparent background, so they sit on the field colour of either scheme. The edge
images carry their colours, so a client that forces inversion still shows one coherent curve.

**Known difference from Paper:** in Paper the board is drawn 290 × 270 and bleeds off the top
right of the field; the template shows it at 164 × 153 in its own cell beside the text.

A changed drawing gets a new version suffix (`.v2.png`) and a bump of `VERSION` in `assets.ts`;
never overwrite a published file, the cache is immutable.
