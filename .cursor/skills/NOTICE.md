# Attribution

The lead agent (`.cursor/agents/lead.md`), the start decision (`scripts/lib/start-decision.mjs`), the run log (`scripts/lib/run-log.mjs`, `scripts/lib/run-report.mjs`) and the gate scripts that follow them are adapted from ideas and logic in the Optio project's workflow runner (the `run-workflow` skill, its lead agent, `runlog.mjs`, `reason.mjs` and `start.mjs`). Optio itself adopted this factory's skills first and then evolved them; we take the patterns back, rewritten for this repo, without its `@optio/harness` package or its Jev decision service.

The skills `principle-test-behavior`, `principle-smallest-change`, `principle-fix-root-causes`, `principle-model-the-domain` and `principle-prove-it-works`, and the step shape of `build` and `review` (lettered steps copied into a todo list, a reply contract, findings that must be proven by a run), are adapted from pstack by Lauren Tan (https://github.com/cursor/plugins/tree/main/pstack), used under the MIT License:

> Copyright (c) 2026 Lauren Tan
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
