# ─── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ─── Stage 2: production ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/dist ./dist

EXPOSE 3001

# Note: env vars come from EasyPanel / container environment (no --env-file)
CMD ["node", "dist/index.js"]
