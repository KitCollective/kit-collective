# Seed image for Coolify on the CX33 host.
# Default CMD is the 24/7 Seed MCP HTTP process. One-shot jobs override `command`.

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY seed ./seed
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @kit/domain build \
  && pnpm --filter @kit/db build \
  && pnpm --filter @kit/seed-shared build \
  && pnpm --filter @kit/seed-fkapi build \
  && pnpm --filter @kit/seed-apify build \
  && pnpm --filter @kit/seed-mcp build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/seed ./seed
COPY --from=build /app/packages ./packages
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json

# Builds @kit/domain + @kit/db (seed-apify imports them at module scope) plus shared + MCP
# layers. Apify/FK CLI packages (KIT-8 / KIT-9) must exist in seed/ before a job command
# can succeed at runtime. Jobs override this CMD; Coolify applications keep it.
EXPOSE 8787
CMD ["node", "seed/mcp/dist/http.js"]
