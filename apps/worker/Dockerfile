# syntax=docker/dockerfile:1.7
# Збирається з кореня монорепо: docker build -f apps/worker/Dockerfile .
# Етап build ставить усі залежності й компілює лише worker і його workspace-пакети;
# етап runtime містить тільки production-залежності та dist.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node packages/config/package.json packages/config/
COPY --chown=node:node packages/contracts/package.json packages/contracts/
COPY --chown=node:node packages/db/package.json packages/db/
COPY --chown=node:node packages/domain/package.json packages/domain/
COPY --chown=node:node packages/i18n/package.json packages/i18n/
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/worker/package.json apps/worker/
COPY --chown=node:node apps/admin-web/package.json apps/admin-web/
COPY --chown=node:node apps/qr-kiosk/package.json apps/qr-kiosk/

FROM deps AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --chown=node:node packages packages
COPY --chown=node:node apps/worker apps/worker
RUN pnpm --filter worker... run build

FROM deps AS runtime
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter worker...
COPY --from=build --chown=node:node /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /repo/packages/db/dist packages/db/dist
COPY --from=build --chown=node:node /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build --chown=node:node /repo/packages/domain/dist packages/domain/dist
COPY --from=build --chown=node:node /repo/packages/i18n/dist packages/i18n/dist
COPY --from=build --chown=node:node /repo/apps/worker/dist apps/worker/dist
USER node
# Воркер без публічного порту: живість видно в логах («worker запущено») і в BullMQ.
CMD ["node", "apps/worker/dist/main.js"]
