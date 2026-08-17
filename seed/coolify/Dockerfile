# One-shot seed jobs for Coolify on the CX33 host.
# These are resource-limited jobs, not 24/7 services. Import each compose file as a
# Coolify "Docker Compose" resource with restart policy disabled / run-once semantics.

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
RUN pnpm --filter @kit/seed-shared build \
  && pnpm --filter @kit/seed-mcp build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/seed ./seed
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json

# Builds shared + MCP layers. Apify/FK CLI packages (KIT-8 / KIT-9) must exist in seed/
# before the job command can succeed at runtime.
