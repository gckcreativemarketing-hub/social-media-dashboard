#!/bin/bash
# deploy.sh — Upload & restart dashboard di Hostinger VPS
set -e

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

REMOTE_DIR="/var/www/dashboard-sosmed"

echo "→ Deploying ke ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"

# 1. Upload files (exclude node_modules dan .env)
rsync -avz --progress \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.deploy_tmp' \
  -e "ssh -p ${SSH_PORT}" \
  ./ "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

# 2. Remote: install deps + copy .env + restart PM2
ssh -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" << REMOTE
  cd ${REMOTE_DIR}

  # Copy .env ke server (jika belum ada)
  if [ ! -f .env ]; then
    echo "⚠ .env belum ada di server. Upload manual via hPanel > File Manager."
    exit 1
  fi

  npm install --omit=dev
  pm2 startOrRestart ecosystem.config.js --env production
  pm2 save
  echo "✓ Deploy selesai!"
REMOTE

echo ""
echo "✅ Dashboard live di: https://pakarpajak.id/dashboard-sosmed"
