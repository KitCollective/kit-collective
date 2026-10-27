# E-mail images

Served by `GET /v1/email/assets/:file` (`apps/api/src/notify/email-assets.controller.ts`) with
`Cache-Control: public, max-age=31536000, immutable`. Only the names in `src/notify/assets.ts`
(`EMAIL_ASSET_FILES`) are served; any other name is a 404.

**The PNGs are not here yet.** They are exported by a person from the Paper file
"KitCollective App", page `09 E-mail`, as @2x PNGs. Do not redraw them
(`docs/design-system.md` → Transactional e-mail → Gaps).

| File | What |
| --- | --- |
| `lockup-light.v1.png`, `lockup-dark.v1.png` | KC mark 28 + wordmark 21, 28 high, outlined (no live text) |
| `board-{1,2,3}-{light,dark}.v1.png` | Tactical board, desktop size (shown 164 wide) |
| `board-{1,2,3}-{light,dark}-phone.v1.png` | Tactical board at 160 × 149 |
| `edge-{light,dark}-600.v1.png`, `edge-{light,dark}-375.v1.png` | Curved edge: canvas-colour ellipse rising over the field colour, full width. Baked-in colours, so a client that forces inversion still looks coherent |

A changed drawing gets a new version suffix (`.v2.png`) and a bump of `VERSION` in `assets.ts`;
never overwrite a published file, the cache is immutable.
