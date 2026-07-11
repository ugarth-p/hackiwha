# ---- Stage 1: Build NestJS ----
FROM node:22-slim AS builder

WORKDIR /app

COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml backend/.npmrc ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY backend/prisma ./prisma/
RUN npx prisma generate

COPY backend/src ./src/
COPY backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json ./
RUN pnpm build

# ---- Stage 2: Production (Node.js + Python) ----
FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-dev \
        build-essential \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

# Copy built NestJS app
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma/
COPY backend/prisma.config.ts ./prisma.config.ts

# Fix Prisma 7 generated client: tsc with moduleResolution "nodenext" preserves
# .ts extensions in require() paths, but the compiled files are .js
RUN find dist/src/generated -name '*.js' -exec sed -i "s/\.ts'/\.js'/g; s/\.ts\"/\.js\"/g" {} +

# Copy Python workers
COPY workers/ ./workers/

# Install Python dependencies globally
RUN pip3 install --no-cache-dir --break-system-packages -r workers/requirements.txt

# Copy and set up entrypoint
COPY backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

CMD ["./entrypoint.sh"]
