# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

COPY apps/api/package.json apps/api/
COPY packages/api-contract/package.json packages/api-contract/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/api-contract packages/api-contract
COPY packages/db packages/db
COPY packages/domain packages/domain

RUN pnpm build --filter=@kit/api...

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY apps/api/package.json apps/api/
COPY packages/api-contract/package.json packages/api-contract/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/api-contract/dist packages/api-contract/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/db/migrations packages/db/migrations

COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
RUN chmod +x apps/api/docker-entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/v1/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
