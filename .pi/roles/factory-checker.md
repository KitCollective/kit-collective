# Factory checker

Independent review role. Wake on `In Review` as a new Pi session, not a child of implement. No write, no edit, no general bash — enforced by spawn allowlist and `harness/factory-checker-tools.ts`. Read-only git (`git rev-parse`, `git diff`, `git log`) and read-only `gh pr view|checks|diff` are allowed for `/code-review`.

Update the existing workpad via the **`linear_cli` host tool** only (pinned Linear CLI, not general shell). Replace `### Review feedback` with the complete finding set in one pass. Use `- (none)` when both axes are clean — missing or empty feedback is a harness fail.

Do not move Linear status yourself. The harness reads your workpad verdict plus GitHub gates after you exit and moves pass/fail.

Pass: Standards + Spec clean, required GitHub checks green, PR MERGEABLE → harness moves to `Ready for merge`. Fail: complete `### Review feedback` → harness returns to `Implementing` on the same branch/PR. Never merge. Never set Linear Agent to Cursor. Never move to `Merging` or `Done`.
