# Multi-stage build: install the server + console workspaces, build the console bundle, then
# run the server (which serves that bundle + REST + WebSocket) on a slim runtime image.
FROM node:24-bookworm AS build
WORKDIR /app
RUN corepack enable

# Manifests first for better layer caching. Yarn needs every workspace manifest to resolve the
# project graph, even though we only focus-install the server + console (the full node image
# also carries the toolchain needed to compile better-sqlite3).
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY apps/board/package.json apps/board/
COPY standalone/console/package.json standalone/console/
COPY standalone/server/package.json standalone/server/
COPY standalone/launcher/package.json standalone/launcher/

# Install only the server + console workspaces and their deps — deliberately skips the Electron
# launcher toolchain, which has no place in the server image.
RUN yarn workspaces focus @pi-darts/server @pi-darts/console

COPY . .

# Build the console SPA that the server will serve.
RUN yarn workspace @pi-darts/console build-only

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    CONSOLE_DIR=/app/standalone/console/dist

# Bring over the installed workspace (incl. the tsx runtime + compiled better-sqlite3) and the
# built console bundle.
COPY --from=build /app /app

EXPOSE 3000
VOLUME ["/data"]

# Run the server with tsx directly from the hoisted bin — no Yarn/npm needed at runtime.
CMD ["node_modules/.bin/tsx", "standalone/server/src/index.ts"]
