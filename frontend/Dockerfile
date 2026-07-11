# ---- Stage 1: Build React app ----
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- Stage 2: Serve with nginx ----
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/nginx.ssl.conf
COPY nginx.http.conf /etc/nginx/conf.d/nginx.http.conf
COPY init-ssl.sh /usr/local/bin/init-ssl.sh

RUN chmod +x /usr/local/bin/init-ssl.sh

# Start with HTTP-only config (for initial cert acquisition)
RUN cp /etc/nginx/conf.d/nginx.http.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
