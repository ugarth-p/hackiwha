#!/bin/sh
set -e

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"

echo "=== SSL setup for $DOMAIN ==="

# Ensure stack is running with HTTP-only nginx
echo "Starting stack..."
docker compose up -d frontend

echo "Waiting for nginx to be ready..."
sleep 3

# Obtain certificate via certbot service
echo "Requesting Let's Encrypt certificate..."
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/html \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive

# Switch nginx to SSL config and reload
echo "Switching nginx to SSL..."
docker compose exec frontend sh -c "cp /etc/nginx/nginx.ssl.conf /etc/nginx/conf.d/default.conf && nginx -s reload"

echo "=== SSL setup complete for $DOMAIN ==="
echo "Verify: curl -I https://$DOMAIN"
