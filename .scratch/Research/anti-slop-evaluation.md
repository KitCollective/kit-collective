# anti-slop evaluation

Date: 2026-08-22

## Source

- Project README: <https://github.com/dmmulroy/anti-slop>
- Current package manifest: <https://raw.githubusercontent.com/dmmulroy/anti-slop/main/package.json>
- Local evidence: root `package.json`, `tsconfig.base.json`, `.github/workflows/ci.yml`, and `.cursor/rules/`.

## What anti-slop is

`dmmulroy/anti-slop` is a vendorable Oxlint plugin, not a versioned npm package
intended for ongoing consumption. Its authors explicitly ask teams to copy the
rules into their repository and adapt them.

Its generic rules reject low-evidence TypeScript patterns, including chained
assertions, broad `object` parameters, unsafe dictionary value types, unparsed
`unknown` inputs, module mocks, ad-hoc runtime `typeof` checks, and assertions
without an immediately preceding safety comment.

## Fit for KitCollective

The workspace already has useful domain and orchestration guardrails, strict
TypeScript with `noUncheckedIndexedAccess`, import-boundary checks, test
packages, and CI checks for build, imports, workflow secrets, workflows, and
tests. It has no configured JavaScript/TypeScript linter, and CI does not run
the root `lint` or `typecheck` scripts.

The plugin is directionally compatible with the project's preference for
explicit boundaries and testable seams. But enabling all rules immediately
would be high-friction: the codebase has existing `unknown` uses at parsing and
external-vendor boundaries, chained assertions, and ad-hoc `typeof` parsing.
The README itself labels the rule set opinionated. No Vitest or Jest module
mocks were found at the time of this evaluation.

## Recommendation

Do not install it wholesale as a dependency or adopt its bundled agent skill.
If adopted, vendor the reviewed rules, pin compatible `oxlint` and
`@oxlint/plugins` versions in the lockfile, and start with a small,
repository-specific rule set:

1. Require a `SAFETY:` rationale for non-`as const` assertions.
2. Reject chained assertions and widen-then-assert flows.
3. Reject `object` parameters and unsafe dictionary contracts.
4. Keep `unknown` allowed at named adapter/parser boundaries, but disallow
   masking it behind aliases or returning it from public contracts.
5. Reject new module mocks from the start; current tests have no module mocks,
   and the rule reinforces the existing preference for real dependency seams.

Before enforcing any new rule, add a CI job that runs both `pnpm typecheck` and
the selected lint command. A one-week warning-only baseline, followed by
targeted errors for changed code, is safer than a repository-wide cleanup in
one change.

## Task gate

Green (research only): scope limited to an evidence-based recommendation; no
runtime code or dependency changes were made.
