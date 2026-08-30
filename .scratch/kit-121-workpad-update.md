## Agent Workpad

**Branch:** `kit-121`
**PR:** https://github.com/KitCollective/kit-collective/pull/138
**Status:** Implementing — first run complete, awaiting GitHub checks

### Scout brief
- Detaljer screen was stub-only; moderation tables/endpoints missing
- Implemented: Moderation block/report, collection hide + peer stub, mobile Detaljer UI

### Domain helpers used
- scout ✓
- drizzle — attempted (pi subagent not registered; implemented inline at Drizzle seam)
- nest — attempted (pi subagent not registered; implemented inline)
- expo — attempted (pi subagent not registered; implemented inline)
- ui-ux — attempted (pi subagent not registered; implemented inline)

### Testing seams
- `packages/api-contract` `/v1` via Nest HTTP: block both lists, delete one side, report 201, 401
- Mobile: Detaljer navigation + danger rows + helper copy

### Acceptance criteria
- [x] Detaljer hides Tab bar; grouped lists on fill.secondary; no Help
- [x] Profile stub: handle, UserJersey count, city only when present
- [x] Rapportér persists Moderation report; 201 success
- [x] Blokér creates block; both collectors stop seeing threads
- [x] Slet samtale sets hiddenAt for deleter only
- [x] Helper copy: block mutual-hide, delete mine-only
- [x] Destructive rows: danger colour + icon
- [x] Authenticated report/block/delete; 401 without session
- [x] Follow design-system.md

### Review feedback
- (none)

### Validation
- Rebase: `origin/development` ancestor of HEAD — green
- `pnpm format:check` — green
- Typecheck `@kit/mobile`, `@kit/api`, `@kit/db`, `@kit/api-contract` — green
- `pnpm --filter @kit/api-contract exec vitest run tests/conversation-moderation.test.ts` — green
- `pnpm --filter @kit/mobile test -- inbox-wide-open-details` — green
- GitHub required checks — pending (harness waits)

### Evidence
- (pending CI green)

### Loop counters
- ciFailCycles: 0
- reviewLoops: 0
