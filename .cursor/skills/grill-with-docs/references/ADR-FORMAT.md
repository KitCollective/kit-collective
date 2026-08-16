# ADR Format

ADRs live in `docs/adr/` as `0001-slug.md`, `0002-slug.md`, …. Create the directory lazily.

## Template

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

An ADR can be a single paragraph.

## Optional sections

Only when they add value: Status (`proposed | accepted | deprecated | superseded by ADR-NNNN`), Considered Options, Consequences.

## Numbering

Highest existing number + 1.

## When to offer an ADR

All three must be true: hard to reverse, surprising without context, real trade-off. Otherwise skip it.
