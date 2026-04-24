# ─── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build context = repo root, so paths are api/...
COPY api/package*.json ./
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src/ ./src/
RUN npm run build

# ─── Stage 2: production ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

COPY api/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
