#!/usr/bin/env bash
# Runs ON the EC2 instance (started by watchparty-deploy via SSM).
# Usage: deploy.sh <ecr-image-uri>
# Pulls the image, restarts the stack, waits until the backend is healthy and
# rolls back to the previous image if it is not.
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image>}"
APP_DIR="${APP_DIR:-/opt/watchparty}"
cd "$APP_DIR"

[ -f .env ] || { echo "ERROR: $APP_DIR/.env is missing (see docs/ec2-deploy.md, step 5)"; exit 1; }

REGISTRY="${IMAGE%%/*}"
REGION="$(echo "$REGISTRY" | cut -d. -f4)"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

compose() { docker compose --env-file .env --env-file image.env "$@"; }

PREV_IMAGE=""
if [ -f image.env ]; then
  PREV_IMAGE="$(grep '^BACKEND_IMAGE=' image.env | cut -d= -f2- || true)"
fi

echo "BACKEND_IMAGE=$IMAGE" > image.env
compose pull backend
compose up -d --remove-orphans
# Pick up Caddyfile changes without restarting the container (ignore if Caddy is still starting).
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

echo "Waiting for the backend to become healthy..."
healthy=0
for _ in $(seq 1 30); do
  cid="$(compose ps -q backend || true)"
  status="missing"
  if [ -n "$cid" ]; then
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo missing)"
  fi
  if [ "$status" = "healthy" ]; then healthy=1; break; fi
  sleep 3
done

if [ "$healthy" -ne 1 ]; then
  echo "ERROR: new version did not become healthy. Last backend logs:"
  compose logs --tail=50 backend || true
  if [ -n "$PREV_IMAGE" ] && [ "$PREV_IMAGE" != "$IMAGE" ]; then
    echo "Rolling back to $PREV_IMAGE"
    echo "BACKEND_IMAGE=$PREV_IMAGE" > image.env
    compose up -d --remove-orphans
    echo "Rolled back."
  fi
  exit 1
fi

echo "Healthy. Cleaning up old images."
docker image prune -af --filter "until=24h" >/dev/null || true
echo "Deployed $IMAGE"
