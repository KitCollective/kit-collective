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
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY boot-env.mjs job-queue.mjs server.mjs webhook-router.mjs ./
EXPOSE 8080
CMD ["node", "server.mjs"]
