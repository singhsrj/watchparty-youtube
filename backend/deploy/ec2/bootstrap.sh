#!/bin/bash
# EC2 "user data": runs once, as root, on first boot of a fresh Ubuntu 24.04 instance.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y docker.io docker-compose-v2 curl unzip
systemctl enable --now docker

# AWS CLI v2 (used for the ECR login during deploys)
curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/aws /tmp/awscliv2.zip

# 1 GB swap: a t3.micro only has 1 GB of RAM, this stops it falling over under pressure
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/watchparty/caddy

# Launcher: fetches the compose/Caddy/deploy files for the exact commit being deployed, then deploys.
cat > /usr/local/bin/watchparty-deploy <<'LAUNCHER'
#!/usr/bin/env bash
# Usage: watchparty-deploy <ecr-image> <github-owner/repo> <git-sha>
set -euo pipefail
IMAGE="${1:?image}"; REPO="${2:?repo}"; SHA="${3:?sha}"
APP_DIR="${APP_DIR:-/opt/watchparty}"

[[ "$IMAGE" =~ ^[0-9]+\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9._/-]+:[A-Za-z0-9._-]+$ ]] || { echo "bad image: $IMAGE"; exit 2; }
[[ "$REPO"  =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || { echo "bad repo: $REPO"; exit 2; }
[[ "$SHA"   =~ ^[0-9a-f]{40}$ ]] || { echo "bad sha: $SHA"; exit 2; }

BASE="${RAW_BASE:-https://raw.githubusercontent.com}/$REPO/$SHA/backend/deploy/ec2"
cd "$APP_DIR"
mkdir -p caddy
for f in docker-compose.yml deploy.sh caddy/Caddyfile; do
  curl -fsSL "$BASE/$f" -o "$f.new"
  mv "$f.new" "$f"
done
chmod +x deploy.sh
exec ./deploy.sh "$IMAGE"
LAUNCHER
chmod +x /usr/local/bin/watchparty-deploy

touch /opt/watchparty/.bootstrap-done
