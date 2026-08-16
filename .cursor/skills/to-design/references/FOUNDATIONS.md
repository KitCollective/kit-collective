# Foundations

Shared visual and behavioral decisions. Lock **meaning**, **usage**, **relationships**, and **constraints** — not a dump of hex codes.

Recommend concrete values from the taste round and the repo. The human accepts or overrides. After lock, agents select from this set.

Interview one foundation at a time when the frontier is large; batch related ones (color + elevation, spacing + layout) when they must cohere.

Each foundation in the MD gets: purpose, scale or roles, usage rules, relationships to other foundations, constraints (accessibility and platform), one *example*, exceptions.

## Coverage

Lock a foundation when screens will need a shared rule. Defer one that would only decorate a future surface.

| Foundation | Locks | Ask | Constraint to preserve |
| --- | --- | --- | --- |
| **Typography** | Family, role scale (display / title / body / label / caption), weight, line-height, truncation | Which roles exist? What is body vs label for? | Readable body size; sufficient contrast; no text as the only state signal |
| **Color** | Roles (canvas, surface, text, border, accent, danger, success, warning, info), states, dark/light if shipped | What is accent *for*? What must never compete with it? | Contrast for text and UI; color not the only error signal |
| **Spacing** | Scale (steps), padding vs gap vs inset, density | One scale or compact + comfortable? | Touch targets on mobile; consistent rhythm |
| **Layout** | Page/container widths, columns, breakpoints, stacking | What is a screen vs a region vs a row? | Content reflows; no mystery max-widths |
| **Radius** | Scale, nested-surface rule | Sharp, slightly rounded, pill — and when? | Nested radius shrinks; pills are for chips/actions, not cards, unless said otherwise |
| **Elevation** | Surface levels, overlay, scrim | How many depths? What floats? | Overlay must dim and trap focus; elevation is not decoration |
| **Motion** | Duration scale, easing, what moves, reduced-motion | Quiet or expressive? Which moments earn motion? | Honor `prefers-reduced-motion`; prefer opacity/transform |
| **Border** | Hairline vs strong, focus ring, divider | When is a line required vs implied by space? | Focus visible; dividers do not replace headings |

## Recommend, then wait

For each foundation, propose a small table the human can accept:

```text
❓ **Q…** - **Color roles**: Canvas, surface, text/primary, text/muted, accent, danger.
Shipped modes: light only / light+dark.

➡️ Accent = one hue used for primary action and selected state. Danger is a separate role. No gradient.
```

Push back when a recommendation would violate a confirmed principle or the accessibility floor.

## Example shape (not product values)

Copy the *shape* into `docs/design-system.md`. Replace the sample numbers with the human’s lock.

```markdown
### Spacing

**Purpose**: One rhythm for padding, gaps, and insets so screens do not invent local spacing.

**Scale** (example): `4 / 8 / 12 / 16 / 24 / 32 / 48`. Name tokens by step (`space.100`) or by role (`space.inset.md`) — pick one naming family and keep it.

**Usage**: Padding and gap come from the scale. Do not mix ad-hoc pixels with tokens on the same screen.

**Relationships**: Layout gutters use the same scale. Typography line-box sits inside spacing, not the other way around.

**Constraints**: Primary hit targets ≥ 44×44 on mobile surfaces. Compact density is a token set, not one-off tighter padding.

**Example** *(not a rule)*: A list row uses `space.inset.md` horizontal and `space.inset.sm` vertical.

**Exceptions**: Platform sheets may use safe-area insets outside the scale.

Flag missing context; do not invent values, tokens, variants, or rules.
```

## Relationships to check before closing Create

- Color roles and elevation: a raised surface has a surface role, not a random lighter hex.
- Typography and spacing: title + body stacks use the spacing scale, not magic margins.
- Border and focus: focus ring is a token, not a one-off outline.
- Motion and reduced-motion: every animated moment has a still equivalent.
