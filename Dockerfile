# ==============================================================================
# Multi-stage Dockerfile for TanStack Start SSR Application
# DevSecOps Hardened: Non-root user, minimal attack surface, zero-dependency healthcheck
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build stage (using Bun for fast and deterministic lockfile resolution)
# ------------------------------------------------------------------------------
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Install dependencies deterministically
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Optional build-time arguments for client-side bundle injection
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NITRO_PRESET=node-server \
    NODE_ENV=production

# Copy application source code
COPY . .

# Build standalone production server with Nitro node-server preset
RUN bun run build

# ------------------------------------------------------------------------------
# Stage 2: Production runtime stage (minimal Node.js 22 Alpine)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Production environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Ensure data directory exists with ownership for non-root node user
RUN mkdir -p /app/data && chown -R node:node /app

# Copy only the compiled standalone output and traced runtime dependencies
COPY --from=builder --chown=node:node /app/.output ./.output

# Switch to unprivileged built-in node user (Security Principle of Least Privilege)
USER node

EXPOSE 3000

# Zero-dependency container health check using Node.js built-in fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:3000/").then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))'

# Start the standalone Nitro server
CMD ["node", ".output/server/index.mjs"]
