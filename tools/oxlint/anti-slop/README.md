# Vendored anti-slop rules

Oxlint rules copied from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop)
at commit `6d538555cb151d4121ed51a27db81890eacf8ae9` (MIT, see `LICENSE`).

Upstream ships these rules to be vendored and adapted, not consumed as a dependency.
Once copied here they are ours to maintain — change them to match this repository's
standards rather than tracking upstream.

## Which rules we enabled

Registered in [`../../../oxlint.config.ts`](../../../oxlint.config.ts):

| Rule | Why |
| --- | --- |
| `no-chained-type-assertions` | A chain like `x as unknown as T` fabricates evidence the compiler never checked. |
| `no-widen-then-assert` | Widening a known value and asserting it back discards type evidence for no reason. |
| `require-safety-comment-for-type-assertion` | Every remaining assertion must state the invariant that makes it safe. |
| `no-object-parameters` | `object` as an input type accepts anything with a prototype. |
| `no-module-mocking` | Tests belong at real dependency seams (see `.cursor/skills/tdd/SKILL.md`). |

`no-unsafe-dictionary-type` is registered at `warn`, not `error`. Its remaining sites are
the raw vendor payloads that `seed/fkapi/src/normalize.ts` and `seed/apify/src/normalize/`
exist to parse. Ratchet it to `error` once those adapters parse through a schema.

## Which rules we left out, and why

`no-unknown-parameters`, `no-unknown-returns`, `no-unknown-type-aliases` and
`no-runtime-typeof` reject `unknown` and ad-hoc `typeof` narrowing anywhere. This
repository parses untrusted vendor payloads (Transfermarkt, Football Kit Archive)
in named adapters where `unknown` plus `typeof` is the parse step itself — see
`seed/fkapi/src/normalize.ts`. Enabling them today would flag the boundary we
actually want. Revisit once those adapters parse through a schema.

`no-known-value-widening`, `no-conditional-empty-object-spread`, `no-reflect-get`,
`no-reflect-apply` and `no-shape-in-symbol-names` target patterns this codebase
does not currently have. Add them when they earn their keep.

The upstream Effect plugin does not apply — this repository does not use Effect.
