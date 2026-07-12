# Multi-stage build: install the workspace, build the console bundle, then run the
# server (which serves that bundle + REST + WebSocket) on a slim runtime image.
FROM node:24-bookworm AS build
WORKDIR /app

# Manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/board/package.json apps/board/
COPY standalone/console/package.json standalone/console/
COPY standalone/server/package.json standalone/server/

# Install all workspace deps (build tools available here for native better-sqlite3).
RUN npm install

COPY . .

# Build the console SPA that the server will serve.
RUN npm run build -w @pi-darts/console

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    CONSOLE_DIR=/app/standalone/console/dist

# Bring over the installed workspace (incl. tsx runtime) and built console bundle.
COPY --from=build /app /app

EXPOSE 3000
VOLUME ["/data"]

# tsx runs the TypeScript server directly; no separate compile step needed.
CMD ["npm", "run", "start", "-w", "@pi-darts/server"]
