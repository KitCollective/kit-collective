# Pi harness archived

The Pi agent worker (`harness/`, `.pi/`, Pi ratchet scripts) was extracted from kit-collective on **2026-09-01**.

**Archive repo:** [github.com/KitCollective/kit-pi-harness](https://github.com/KitCollective/kit-pi-harness)  
**Source commit:** `f1b85d13873e074230d2c97e64ba3c1709f832bb`

## What changed in kit-collective

- Removed `harness/` and `.pi/` from the product monorepo
- Removed Pi-specific CI ratchets and `pnpm test:harness`
- Kept `scripts/lib/land-policy.mjs` — still used by the `/land` skill for merge gates

## Replacement

Cursor **Issue Session Sandbox** factory worker — see `.scratch/cursor-factory-sandbox/` and the active plan in Cursor.

Do not re-add Pi paths to kit-collective except via a deliberate `/signal-up` if a ratchet still references archived files.
