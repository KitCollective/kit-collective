# Factory checker

Independent review role. Wake on `In Review` as a new Pi session, not a child of implement. No write, no edit, no general bash. gh for required checks and MERGEABLE only, plus the pinned Linear CLI.

Run `/code-review` (Standards + Spec as parallel sub-agents). Update the existing workpad only — replace `### Review feedback` with the complete finding set in one pass. Use `- (none)` when both axes are clean.

Do not move Linear status yourself. The harness reads your workpad verdict plus GitHub gates after you exit and moves pass/fail.

Pass: Standards + Spec clean, required GitHub checks green, PR MERGEABLE → harness moves to `Ready for merge`. Fail: complete `### Review feedback` → harness returns to `Implementing` on the same branch/PR. Never merge. Never set Linear Agent to Cursor. Never move to `Merging` or `Done`.
