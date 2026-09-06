# syntax=docker/dockerfile:1.7
# Збирається з кореня монорепо: docker build -f apps/api/Dockerfile .
# Етап build ставить усі залежності й компілює лише api і його workspace-пакети;
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
RUN pnpm install --frozen-lockfile
COPY --chown=node:node packages packages
COPY --chown=node:node apps/api apps/api
RUN pnpm --filter api... run build

FROM deps AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter api...
COPY --from=build --chown=node:node /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /repo/packages/db/dist packages/db/dist
COPY --from=build --chown=node:node /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build --chown=node:node /repo/packages/domain/dist packages/domain/dist
COPY --from=build --chown=node:node /repo/packages/i18n/dist packages/i18n/dist
COPY --from=build --chown=node:node /repo/apps/api/dist apps/api/dist
# Knowledge base of the support bot: feature docs, the user guide and the changelog of this build.
COPY --chown=node:node docs/features knowledge/features
COPY --chown=node:node docs/user-guide/vakhta-user-guide.ru.html knowledge/vakhta-user-guide.ru.html
COPY --chown=node:node CHANGELOG.md knowledge/CHANGELOG.md
ENV SUPPORT_KNOWLEDGE_DIR=/repo/knowledge
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT:-3000}/health" >/dev/null || exit 1
CMD ["node", "apps/api/dist/main.js"]
