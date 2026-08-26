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
  && npm install -g @schpet/linear-cli@2.5.0 @earendil-works/pi-coding-agent@0.84.3 \
  && corepack enable \
  && corepack prepare pnpm@9.15.4 --activate \
  && rm -rf /var/lib/apt/lists/*

COPY .pi /workspace/.pi
ENV PI_WORKSPACE=/workspace
WORKDIR /workspace
# Global install only: `pi install -l` refuses untrusted project trees in Docker.
RUN pi install npm:pi-subagents \
  && pi install npm:@ghoseb/pi-damage-control \
  && pi install npm:pi-cursor-sdk

WORKDIR /app
COPY harness/boot-env.mjs harness/capacity.mjs harness/job-queue.mjs harness/linear-cli.mjs harness/linear-actor-token.mjs harness/delegate-gate.mjs harness/pi-job.mjs harness/pi-event-stream.mjs harness/planner.mjs harness/intake.mjs harness/server.mjs harness/webhook-router.mjs harness/worktree.mjs harness/gh-cli.mjs harness/implement-exit.mjs harness/checker-exit.mjs harness/checker-spawn.mjs harness/factory-checker-tools.ts harness/session-adapter.mjs harness/land.mjs ./
COPY scripts/lib/land-policy.mjs /scripts/lib/land-policy.mjs
EXPOSE 8080
CMD ["node", "server.mjs"]
