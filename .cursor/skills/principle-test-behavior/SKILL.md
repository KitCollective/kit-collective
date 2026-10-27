---
name: principle-test-behavior
description: Apply when you write, change or keep a test. Assert what the code's users can observe, so the test fails when that behavior breaks and keeps passing when only the internals change.
---

# Test behavior, not implementation

Adapted from pstack (Lauren Tan, MIT). See [NOTICE](../NOTICE.md).

A test is a claim about what the code does for its users: a caller, a screen, another service. Behavior is what they can observe through the interface they use: return values, errors, state they read back, a request sent, a row written. Implementation is what they cannot: private helpers, call order, intermediate data.

Judge every test against two imagined edits:

- **Break the behavior.** Return a wrong value, skip an effect, do it twice. If the test still passes, it proves nothing. Usual causes: an assertion looser than the contract, an expected value computed by the code under test, an assertion on data the test built itself.
- **Change the internals.** Keep every observable result and restructure underneath. If the test now fails, it is pinned to the implementation.

Keep tests that catch the first edit and survive the second. Derive the expected value from the issue, not from a run of the code.

In KitCollective: a test that reads a source file and matches a regex survives no refactor and catches no runtime bug. Use it only for wiring with no other seam, and say so.
