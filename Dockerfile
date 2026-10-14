# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
# Has npm, TypeScript and all dev tools. None of this reaches the final image.
FROM node:24-alpine AS build
WORKDIR /app

# Copy only the package files first. If they did not change, Docker reuses
# the cached `npm ci` layer and the build takes seconds instead of a minute.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ---------- Stage 2: runtime ----------
# Only Node, production packages, the compiled JavaScript and the web page.
FROM node:24-alpine AS runtime
LABEL org.opencontainers.image.title="pulse" \
      org.opencontainers.image.description="Status app shipped by a Docker CI/CD pipeline to AWS EC2" \
      org.opencontainers.image.source="https://github.com/vishi-vishnu/dockerized-cicd-pipeline" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public ./public
COPY package.json ./

# Build details, filled in by the pipeline. Placed last so they do not break the cache above.
ARG APP_VERSION=dev
ARG GIT_SHA=local
ARG BUILD_TIME=unknown
# Demo switch for the rollback demo (see docs/SETUP.md). Always false for normal builds.
ARG SIMULATE_BAD_RELEASE=false
ENV APP_VERSION=$APP_VERSION \
    GIT_SHA=$GIT_SHA \
    BUILD_TIME=$BUILD_TIME \
    SIMULATE_BAD_RELEASE=$SIMULATE_BAD_RELEASE

# Run as the built-in non-root user. Files above stay owned by root, so the app cannot change them.
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/server.js"]
