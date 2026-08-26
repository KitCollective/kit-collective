# Gap lock plate — Button dock (2026-08-23)

**Issue:** KIT-37  
**Status:** locked via `docs/design-system.md`

## Pattern

Bottom-pinned footer actions on login, register, confirm, and empty collection.

| Property | Value |
| --- | --- |
| Layout | Vertical stack in `ButtonDock` |
| Primary | `Button` `variant=primary` `width=fill` |
| Radius | `radius.sm` (8px) |
| Min height | 48px on fill primaries |
| Tertiary path | `Button` `variant=tertiary` stacked below primary |
| Safe area | `paddingBottom` respects device inset |

## Screens

| Screen | Primary | Tertiary below |
| --- | --- | --- |
| Login | Log ind (fill) | Opret konto |
| Register | Opret konto (fill) | Har du allerede en konto? |
| Confirm | Gem (fill) | — (Annuller when present) |
| Empty collection | Tilføj trøje (fill) | — |

## Out of scope for dock

- Camera chrome (horizontal hug controls)
- Banner inline actions (Prøv igen, etc.)
- Chip row, sheet footers with inline tertiary

## Code

`apps/mobile/src/components/ui.tsx` — `ButtonDock`, `Button` with `width`.
