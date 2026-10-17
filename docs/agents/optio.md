# Optio: install, reload, update

Optio is the bb plugin in `plugins/factory/` (plugin id `optio`, CLI `bb optio`; CONTEXT.md: **Optio**, ADR-0062). It runs inside the bb server on the owner's Mac and holds the Staff agents (Max, the Orchestrator), their memory and, once KIT-359/KIT-360 land, the Board. This page is how to get a merged change into the running plugin.

## The `bb` that builds it must match the app

`bb plugin build` compiles against the plugin SDK of the `bb` on your PATH, not the app's. The global npm package `bb-app` does not update itself with the desktop app: on 2026-10-17 it was 0.41.0 (SDK 0.4.34) while the app was 0.46.0, and the build failed on `experimental_Icon`. Check both before building:

```bash
bb --version
defaults read /Applications/bb.app/Contents/Info CFBundleShortVersionString
```

When they differ: `npm install -g bb-app@<app version>`. `bb plugin types --check plugins/factory` then says `pin is 0.6.37, host is 0.6.37`.

## First install (done 2026-10-17, KIT-358)

From the main checkout, on `development`:

```bash
pnpm install --frozen-lockfile --filter @kit/bb-plugin-optio...
bb plugin build plugins/factory
bb plugin install path:$PWD/plugins/factory --yes
```

Then the agents are created through the plugin's RPC (`agent_create`); Max's instructions are the system prompt in `staff/max.md`. The Board is not set up until KIT-359.

## After a merge that touches `plugins/factory/`

```bash
bash scripts/sync-development.sh
pnpm install --frozen-lockfile --filter @kit/bb-plugin-optio...
bb plugin build plugins/factory
bb plugin reload optio
```

The install is by path, so `reload` picks up the rebuilt `dist/` and keeps the plugin's settings, agents and memory. Never `bb plugin remove optio` to update it: removing deletes its database (agents, memory, automations).

## What it replaced

The Meta Agents plugin (`bb meta-agents`, folder `~/Projects/bb-plugin-meta-agents`, repo `KitCollective/bb-plugin-meta-agents`) was removed on 2026-10-17. Its agents were Orchestrator, Max, DevOps and Frontend; the Orchestrator's five automations and four Linear triggers were all disabled and had never run, so none was carried over (KIT-358).
