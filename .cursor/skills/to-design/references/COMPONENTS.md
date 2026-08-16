# Components

Reusable UI with a predictable API. Inventory first; depth second. **Clarity first**: a thin contract for the primitives you will actually compose beats a catalog of unused variants.

The tables below are **shape** — pedagogy for the interview. Copy the contract fields into `docs/design-system.md`. Copy example values only when the human chose them.

## Inventory

Ask which primitives the in-scope surfaces need **now**. Typical first set for a product with list + form + detail:

| Primitive | Recurring need |
| --- | --- |
| Button | Commit, secondary, tertiary, destructive |
| Icon button | Compact action when a label would not fit; still needs an accessible name |
| Text field | Short input with label, error, optional hint |
| List row | Navigate or select one item in a collection |
| Empty state | A collection with nothing in it yet |
| Sheet / modal | Focused task over the current screen |
| Chip / filter | Toggle a discrete facet |
| Toast / banner | Transient or persistent system feedback |

Defer composites (checkout flow, settings page) until the primitives they are made of exist. Patterns belong in the MD only when composition rules are stable.

A request for a new primitive is **include / defer / exclude** against Scope. Do not invent a component during `/implement`.

## Contract

Every locked component in the MD uses this shape:

```markdown
### <Name>

**Purpose**: The recurring need. One sentence.
**Anatomy**: Parts and slots (e.g. label, leading icon, trailing meta).
**Properties**: The API. Required vs optional. Defaults.
**Variants**: Named, finite. Each variant exists for a distinct need.
**States**: Rest, hover/pressed (if the platform has a pointer), focus, disabled, loading, error, empty — only those that apply.
**Accessibility**: Role, name, keyboard, contrast, hit target, reduced motion.
**Composition**: What it combines with. What wraps it.
**Unsupported**: Combinations and uses that look tempting and are wrong.
**Example** *(not a rule)*: One concrete configuration.
**Code**: Host name per in-scope surface (filled in Design–code alignment).

Flag missing context; do not invent values, tokens, variants, or rules.
```

## Example contracts (shape)

### Button

**Purpose**: The primary way to commit an action the user asked for.

**Anatomy**: Label (required). Leading icon (optional). No subtitle inside the button.

**Properties**: `variant`: `primary` | `secondary` | `tertiary` | `destructive`. `size`: `md` (default) | `sm`. `disabled`, `loading`.

**Variants**: `primary` = the one action that moves the task forward. `secondary` = alternative on the same surface. `tertiary` = low-emphasis, often inline. `destructive` = irreversible or data-loss. One `primary` per visible region.

**States**: Rest, pressed, focus, disabled, loading (label stays, control does not accept a second submit).

**Accessibility**: Visible label (icon-only is Icon button). Focus ring from the border/focus foundation. Disabled is not the only way to explain why an action is unavailable — pair with helper text when the reason matters. Hit target ≥ 44×44 on mobile.

**Composition**: Sits in a bar, footer, or inline in a form. Destructive actions confirm when the cost is high (Sheet, not a second button style).

**Unsupported**: Two primaries in one region. Primary + destructive as equal choices. Encoding hierarchy with color that is not a variant token.

**Example** *(not a rule)*: Jersey capture screen footer: one `primary` “Save”, one `tertiary` “Cancel”.

### Text field

**Purpose**: Collect a short string the system will store or search on.

**Anatomy**: Label (required, always visible). Field. Hint (optional). Error (optional, replaces hint when invalid).

**Properties**: `value`, `placeholder` (not a label substitute), `optional`, `error`, `disabled`, `keyboard` hint where the platform has one.

**States**: Rest, focus, disabled, error. Empty is a value, not a state with different chrome.

**Accessibility**: Label programmatically associated. Error is text plus a non-color cue. Helper and error are announced when they appear.

**Composition**: Stacks in a form with the spacing scale. Does not sit inside a Button.

**Unsupported**: Placeholder-only labels. Validating only on every keystroke when the field is still empty.

**Example** *(not a rule)*: Club name field with label “Club”, hint “As printed on the shirt”.

### List row

**Purpose**: Show one item in a collection and let the user open or select it.

**Anatomy**: Leading (optional media). Title (required). Meta (optional, one line). Trailing (chevron, control, or nothing).

**Properties**: `title`, `meta`, `onPress` or `selected`. Density follows the spacing foundation.

**States**: Rest, pressed, selected, disabled. Loading the *list* is a list-level state, not a row variant.

**Accessibility**: The row’s name is the title plus essential meta. Chevron is decorative when the whole row is the control. Hit target ≥ 44 tall on mobile.

**Composition**: Lives in a list. Empty collection uses Empty state, not a blank list. Swipe actions are a pattern on top of this row, documented separately when locked.

**Unsupported**: Multiple primary actions inside one row. Using the row as a form layout.

**Example** *(not a rule)*: Shirt title + year as meta, trailing chevron, leading photo slot.

### Empty state

**Purpose**: Explain an empty collection and the next useful action.

**Anatomy**: Short title. One-sentence body. Optional illustration. Optional Button (`primary` or `secondary`).

**Properties**: `title`, `body`, `action` (optional).

**States**: None beyond rest. Do not animate emptiness.

**Accessibility**: Text is the source of meaning; illustration is decorative. Action uses Button’s contract.

**Composition**: Replaces the list (or the region), not a row inside it.

**Unsupported**: Sarcastic copy. Three competing actions. Using Empty state for errors (that is a banner / inline error).

**Example** *(not a rule)*: “No shirts yet” + “Add the first shirt from your collection” + primary “Add shirt”.

## Depth rule

When the human wants “all components”, push inventory: name the set for this lock, defer the rest in Scope. A component without states, accessibility, and unsupported uses is **thin** — do not mark it locked.
