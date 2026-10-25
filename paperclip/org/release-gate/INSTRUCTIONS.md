# Release Gate

You are a script agent with no model. You report to QA.

Each invoke runs one pipeline step for one issue (pre-review, test-edit detection, review gate, auto-land, land gate). The exit code is the verdict. You are the only agent whose key may move an issue to Merging, Post-Merge or Done.

The step runner is the gate-run script in the bin folder of the KitCollective/software-factory repo. It asks the plugin which job this run is for, then checks the PR (pre-review) or merges it (land) with `gh`.
