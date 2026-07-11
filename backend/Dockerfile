# ---- Stage 1: Build NestJS ----
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
RUN pnpm build

# ---- Stage 2: Production (Node.js + Python) ----
FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-dev \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built NestJS app
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma/

# Copy Python workers
COPY workers/ ./workers/

# Install Python dependencies globally
RUN pip3 install --no-cache-dir -r workers/requirements.txt

EXPOSE 3000

CMD ["node", "dist/main"]
