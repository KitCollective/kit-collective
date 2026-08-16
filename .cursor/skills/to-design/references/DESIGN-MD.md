# `docs/design-system.md` template

Write this file in English. Interview in the user’s language. Replace bracketed prompts. Delete unused Adopt/Evolve headings on a first **Lock**. Keep every *example* labeled so agents do not promote it into a rule.

Status per section: `locked` | `thin` | `deferred` (with reason).

```markdown
# Design system

AI-ready visual and interaction lock for in-scope surfaces.
Agents apply this file. Flag missing context; do not invent values, tokens, variants, or rules.

**Surfaces in scope**: [from factory `labels.surfaces`, minus exclusions]
**Modes**: [Lock date / Gap date]
**Owner**: [approver or named role]

## Goals

**Problem**:
**Audience**:
**Outcomes**:
**Evidence**:
**Priorities**:
**Constraints**:
**Non-goals**:

Flag missing context; do not invent priorities.

## Principles

For each principle:

**[Name]**: [intent in one sentence]
- **When it collides**: [what yields]
- **Follow**: [example]
- **Violate**: [example]
- **Goal it serves**:

Flag missing context; do not invent new rules.

## Scope

**Included** (surface → depth):
**Excluded** (with reason):
**Deferred** (with reason):

Flag missing context; do not expand scope.

## Architecture

**Layers**: foundations → tokens → components → patterns
**Naming**:
**Source of truth** per decision type:
**Placement rule**:

Flag missing context; do not invent layers.

## Ownership

**Visual direction**:
**Tokens / foundations**:
**Components**:
**Review / escalation**:

Route requests. Do not assign authority.

## Foundations

One heading per locked foundation (typography, color, spacing, layout, radius, elevation, motion, border). Each includes purpose, scale or roles, usage, relationships, constraints, example, exceptions.

See the spacing shape in [FOUNDATIONS.md](FOUNDATIONS.md).

Flag missing context; do not invent values or rules.

## Tokens

**Layers**: primitive → semantic [→ component if used]
**Naming**:
**Modes**: [e.g. light / dark]
**References**: [what may alias what]
**Usage**: select semantic tokens in UI; primitives only inside token files

| Token | Role | References | Surfaces |
| --- | --- | --- | --- |

Flag missing context; do not invent tokens or values.

## Components

One contract per locked primitive. Shape in [COMPONENTS.md](COMPONENTS.md).

Flag missing context; do not invent components or variants.

## Patterns

Optional. Only when two or more components compose in a stable way (e.g. list + empty state, form + footer actions). Purpose, composition rules, unsupported combinations.

Flag missing context; do not invent patterns.

## Design–code alignment

| Decision | Surface | Code name | Notes / exceptions |
| --- | --- | --- | --- |

Flag missing context; do not invent APIs or behavior.

## Using this file

1. Read Goals, Principles, and Scope before any screen.
2. Choose existing tokens and components. Compose patterns only as documented.
3. If the screen needs a decision this file does not contain: **flag it**. Do not fill the gap with taste.
4. Platform exceptions live in Design–code alignment, not as one-off values in a component.

## Deferred

| Area | Why now | Revisit when |
| --- | --- | --- |
```

On a **Gap** pass, update only the chosen areas, keep Deferred current, and leave untouched locked sections intact.
