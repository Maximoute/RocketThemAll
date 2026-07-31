# syntax=docker/dockerfile:1.7

FROM node:22.17.1-bookworm-slim AS dependencies
WORKDIR /app
ENV CI=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/game-engine/package.json ./packages/game-engine/package.json
COPY packages/services/package.json ./packages/services/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/database/prisma/schema.prisma ./packages/database/prisma/schema.prisma

RUN npm ci

FROM dependencies AS build
ARG RTA_PUBLIC_BASE_URL=http://localhost:8080
ENV RTA_PUBLIC_BASE_URL=${RTA_PUBLIC_BASE_URL}
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:22.17.1-bookworm-slim AS service-runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/packages ./packages

USER node

FROM service-runtime AS api
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

FROM service-runtime AS bot
COPY --from=build --chown=node:node /app/apps/bot/dist ./apps/bot/dist
CMD ["node", "apps/bot/dist/index.js"]

FROM service-runtime AS worker
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
CMD ["node", "apps/worker/dist/index.js"]

FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npm", "exec", "--", "prisma", "migrate", "deploy", "--schema", "packages/database/prisma/schema.prisma"]

FROM node:22.17.1-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
