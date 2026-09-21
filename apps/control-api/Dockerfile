# syntax=docker/dockerfile:1.7
# Build from the repository root: docker build -f apps/control-api/Dockerfile .
# Compile only the control service and its dependencies; ship production dependencies and dist.

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
COPY --chown=node:node packages/registry/package.json packages/registry/
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/control-api/package.json apps/control-api/
COPY --chown=node:node apps/worker/package.json apps/worker/
COPY --chown=node:node apps/admin-web/package.json apps/admin-web/
COPY --chown=node:node apps/qr-kiosk/package.json apps/qr-kiosk/

FROM deps AS build
RUN pnpm install --frozen-lockfile
COPY --chown=node:node packages packages
COPY --chown=node:node apps/control-api apps/control-api
RUN pnpm --filter control-api... run build

FROM deps AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter control-api...
COPY --from=build --chown=node:node /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /repo/packages/db/dist packages/db/dist
COPY --from=build --chown=node:node /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build --chown=node:node /repo/packages/domain/dist packages/domain/dist
COPY --from=build --chown=node:node /repo/packages/registry/dist packages/registry/dist
COPY --from=build --chown=node:node /repo/packages/registry/drizzle packages/registry/drizzle
COPY --from=build --chown=node:node /repo/apps/control-api/dist apps/control-api/dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${CONTROL_PORT:-3100}/health" >/dev/null || exit 1
CMD ["node", "apps/control-api/dist/main.js"]
