FROM node:22-bookworm-slim

WORKDIR /repo
COPY seed /repo/seed
COPY packages /repo/packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# KIT-8 / KIT-9 land the CLI package.json. Install when present so the job
# can exec the same bin Seed MCP wraps. Missing trees fail at run time, not build.
RUN if [ -f seed/apify/package.json ]; then \
      (cd seed/apify && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi); \
    fi \
 && if [ -f seed/fkapi/package.json ]; then \
      (cd seed/fkapi && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi); \
    fi

# Jobs are one-shot. Coolify / compose must keep restart: "no".
CMD ["node", "--experimental-strip-types", "seed/jobs/run.ts"]
