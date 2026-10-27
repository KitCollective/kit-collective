---
name: principle-model-the-domain
description: Apply when you write logic with state, many branches or repeated shape assumptions. Encode the domain in one structure instead of scattered conditionals.
---

# Model the domain

Adapted from pstack (Lauren Tan, MIT). See [NOTICE](../NOTICE.md).

Name the data shape before you write logic. Reach for:

- a state machine or a discriminated union instead of booleans that must stay in sync;
- a typed model instead of loose parameters;
- a lookup table instead of an if/else chain spread across files;
- one module that owns one body of domain knowledge, named with `CONTEXT.md`'s words.

The sign you skipped this: a new branch added to an existing chain, or a second flag that must agree with the first.

Do not force it. Plain local code that is already clear stays plain.
