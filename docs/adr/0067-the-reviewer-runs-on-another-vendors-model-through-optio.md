# The Reviewer runs on another vendor's model, through Optio's proxy

Nicklas, 2026-10-18. Status: accepted. Terms: **Reviewer**, **Optio**, **Auto-land** in `CONTEXT.md`.

The Reviewer must run on another model than every Engineer round of the issue (`audit-receipt.mjs --require-different-model`, auto-land's independent-reviewer check). With Sonnet Engineers it ran on Opus, and whenever an Engineer round ran on Opus it had to run on Fable: 66 Opus and 11 Fable reviews between 2026-10-17 and 2026-10-18, the most expensive calls of a run. A review reads a diff against the acceptance criteria and the design lock; it needs a capable model, not the strongest one, and a model from another vendor has other blind spots than the one that wrote the code.

## Decision

1. **The Reviewer runs Claude Code on an OpenRouter model**: DeepSeek V4 Pro when the Engineer ran Sonnet, GLM 5.3 when an Engineer round ran Opus. The skill, the hooks, the workpad scripts and the `AUDIT-RESULT` line stay the same.
2. **Optio routes only those threads.** A reviewer thread whose title ends in `:openrouter` gets `ANTHROPIC_BASE_URL` pointed at Optio's route and a token for that thread alone (`bb.providers.experimental_contributeEnv`). Optio forwards each call to OpenRouter with `OPENROUTER_API_KEY` from its key file and asks for endpoints that do not train on the data. Every other thread keeps Anthropic.
3. **It fails closed.** Without the proxy, Claude Code sends the OpenRouter model id to Anthropic, which refuses it: a review never runs silently on a model nobody chose.
4. **The run log records the real model** (`deepseek/deepseek-v4-pro`, `z-ai/glm-5.3`), so the independence checks compare what actually ran.

## Considered options

- Opus everywhere and no Opus Engineers: cheaper, but the Reviewer is still the most expensive call and shares its vendor's blind spots.
- Hermes Agent on OpenRouter: another tool, so the review skill, the hooks and the result line would need a second implementation.
- Setting `ANTHROPIC_BASE_URL` on the runs machine: it would move every thread, Engineers and Leads too.

## Consequences

- The workflow change waits until OpenRouter's guardrail allows both models and one reviewer thread has run end to end on the runs machine.
- The models are hard-coded in the workflow until Optio's Operating settings can choose them (ADR-0065).
- A review that misses what Opus would have caught lands as green: the first reviews run beside the old ones before the switch is trusted.
