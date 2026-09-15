# syntax=docker/dockerfile:1
#
# Astrolabe for the Linux home server (task 10.5, D-55, D-154): one image,
# the API and the built web client from the same address. `docker compose up`
# builds it; see docker-compose.yml and README.md.

# --- Build: the whole workspace -------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so a source change doesn't reinstall dependencies.
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/rules/package.json packages/rules/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci

COPY packages ./packages
# `shared`, `rules` and `server` compile with tsc; the client with tsc and Vite.
RUN npm run build && npm run build --workspace @astrolabe/web

# --- Runtime: production dependencies and the built output ----------------------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/rules/package.json packages/rules/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev --workspace @astrolabe/server --ignore-scripts && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/rules/dist packages/rules/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist

ENV PORT=3000 \
    ASTROLABE_WEB_ROOT=/app/packages/web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/ai/status').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# Migrates on start (serve.ts), then listens.
CMD ["node", "packages/server/dist/http/serve.js"]
