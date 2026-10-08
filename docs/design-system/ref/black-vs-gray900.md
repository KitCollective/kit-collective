# Gap lock plate — black vs gray.900 (2026-08-23)

**Issue:** KIT-37  
**Status:** locked via `docs/design-system.md`

## Primitives

| Token | Value | Role |
| --- | --- | --- |
| `black` | `#000000` | Ink for primary content and fills on light |
| `gray.900` | `#000000` | Dark canvas / border.strong on light (today same hex as black) |

Primitives are separate keys even when values match — enables future `gray.900` drift without breaking semantic ink.

## Light semantic aliases

| Role | Aliases to |
| --- | --- |
| `content.primary` | `black` |
| `fill.primary` | `black` |
| `scrim` | `black` at 40% opacity |
| `border.strong` | `gray.900` |
| `canvas` (dark mode) | `gray.900` |

## Code

`apps/mobile/src/theme/tokens.ts` — `primitive.black`, `primitive.gray900`, `color.contentPrimary`, `color.fillPrimary`.

## Tests

`apps/mobile/tests/tokens.test.ts`
