# CONTEXT.md Format

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Only include terms specific to this project's context.** General programming concepts don't belong.
- **Group terms under subheadings** when natural clusters emerge.
- Never write into the `<!-- factory:generated-start -->` Orchestration block.

## Single vs multi-context

Single context (this factory): one root `CONTEXT.md`. If `CONTEXT-MAP.md` exists, follow it.
