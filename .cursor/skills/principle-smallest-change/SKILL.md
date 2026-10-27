---
name: principle-smallest-change
description: Apply when you size a change, refactor, or want to add an abstraction, option, flag or layer. Bias to deletion and the smallest change that meets the issue.
---

# Smallest change

Adapted from pstack's Laziness Protocol and Subtract Before You Add (Lauren Tan, MIT). See [NOTICE](../NOTICE.md).

- Make the smallest change that meets the issue. Fewer lines beat elegant boilerplate.
- Remove before you add. If dead weight sits where you work, cut it first, then build on the simpler base.
- Put each decision in one place and pass the result, instead of repeating the same check in several files.
- Design for what the issue asks, not for an edge case nobody reported. No speculative validators, options or guards.
- An abstraction earns its place only when it removes branches, duplicated rules or invalid states. A wrapper with one caller does not.
- A comment stays only for a *why* the code cannot show. Never narrate what the next line does.
