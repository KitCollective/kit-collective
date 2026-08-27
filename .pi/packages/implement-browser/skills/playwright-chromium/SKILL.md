---
name: playwright-chromium
description: Headless Chromium on the PI worker for implement UI evidence. Use on mobile/web/admin slices to screenshot a page and attach it under Linear workpad Evidence. Never planner, intake, or api/db-only implement.
---

# Playwright Chromium (worker)

Launch **headless Chromium** via Playwright on this PI worker. This is a Pi package, not Nicklas's Desktop Chrome.

## Hard rules

- Headless only. Do not pass `--headed`.
- Browser is Chromium. Never `--channel=chrome` and not Desktop Chrome.
- Never attach to a personal Chrome profile (`--user-data-dir` must not point at `Google/Chrome`, `google-chrome`, or `~/Library/Application Support/Google`).
- If the harness omitted this skill, do not invent a browser session.
- Capacity: if Chromium spawn is refused, record that under `### Notes` and continue without a screenshot.

## Screenshot → Linear Evidence

1. Open the local UI URL with Playwright Chromium (headless).
2. Write a PNG under `/tmp/pi-playwright/<issue>/`.
3. Upload the file to the Linear issue (`linear` CLI attachment).
4. Link it on the existing workpad under `### Evidence` as `- <title>: <url>`. Update that comment; do not open a new workpad.

Do not spawn Chromium from GitHub Actions. Tests fake this adapter.
