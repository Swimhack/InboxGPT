#!/bin/bash
set -e

echo "=== InboxGPT Deploy ==="

# Build locally
echo "[1/4] Building..."
npm run build

# SCP standalone build to server
echo "[2/4] Uploading standalone build..."
SSH_KEY="$HOME/.ssh/fleet_admin_key"
SERVER="james@137.184.136.55"
REMOTE_DIR="/var/www/sites/inboxgpt.stricklandai.com/app"

scp -i "$SSH_KEY" -r .next/standalone/* "$SERVER:$REMOTE_DIR/"
scp -i "$SSH_KEY" -r .next/static "$SERVER:$REMOTE_DIR/.next/"
scp -i "$SSH_KEY" -r public "$SERVER:$REMOTE_DIR/"

# Copy ecosystem config
echo "[3/4] Uploading PM2 config..."
scp -i "$SSH_KEY" ecosystem.config.js "$SERVER:$REMOTE_DIR/"

# Restart PM2
echo "[4/4] Restarting PM2..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR && pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js"

echo "=== Deploy complete: https://inboxgpt.stricklandai.com ==="
