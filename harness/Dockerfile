FROM node:22-bookworm-slim

# KIT-53 PI worker on kit-harness (CX33). No product PaaS panel. No Postgres client env.
# Linear CLI pin is factory I/O (with gh). Do not install Linear MCP.

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | tee /usr/share/keyrings/githubcli-archive-keyring.gpg >/dev/null \
  && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh bubblewrap \
  && npm install -g @schpet/linear-cli@2.5.0 @earendil-works/pi-coding-agent@0.84.3 @biomejs/biome@2.5.10 \
  && corepack enable \
  && corepack prepare pnpm@9.15.4 --activate \
  && rm -rf /var/lib/apt/lists/*

COPY .pi /workspace/.pi
COPY .cursor/rules /workspace/.cursor/rules
COPY .cursor/skills /workspace/.cursor/skills
ENV PI_WORKSPACE=/workspace
WORKDIR /workspace
# Global install only: `pi install -l` refuses untrusted project trees in Docker.
RUN pi install npm:pi-subagents \
  && pi install npm:@ghoseb/pi-damage-control \
  && pi install npm:pi-cursor-sdk \
  && pi install npm:pi-hermes-memory

# KIT-96: Playwright Chromium headless-shell for implement UI evidence. Not Desktop Chrome.
# Binary only — do not `pi install` implement-browser here; UI implement loads it via --skill.
# Pin is playwright@1.62.1 (npm latest at implement). Never google-chrome / channel=chrome.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright@1.62.1 install --with-deps --only-shell chromium \
  && chmod -R a+rx /ms-playwright \
  && rm -rf /root/.npm /tmp/*

WORKDIR /app
COPY harness/boot-env.mjs harness/capacity.mjs harness/harness-log.mjs harness/factory-exit-log.mjs harness/pi-session-log.mjs harness/agent-activity-translate.mjs harness/linear-agent-session.mjs harness/job-queue.mjs harness/linear-cli.mjs harness/delegate-gate.mjs harness/pi-job.mjs harness/implement-context.mjs harness/first-pass.mjs harness/hermes-lessons.mjs harness/worker-memory.mjs harness/checker-diff.mjs harness/token-cost.mjs harness/token-store.mjs harness/token-report.mjs harness/pi-event-stream.mjs harness/planner.mjs harness/intake.mjs harness/resume.mjs harness/server.mjs harness/webhook-router.mjs harness/worktree.mjs harness/gh-cli.mjs harness/implement-exit.mjs harness/checker-exit.mjs harness/checker-spawn.mjs harness/slop-review.mjs harness/factory-checker-tools.ts harness/slop-agent-tools.ts harness/role-comments.mjs harness/land.mjs harness/auto-merge.mjs ./
COPY scripts/lib/land-policy.mjs scripts/lib/pr-write-scope.mjs scripts/lib/migration-prefix.mjs /scripts/lib/
EXPOSE 8080
CMD ["node", "server.mjs"]
