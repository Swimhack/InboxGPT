#!/bin/bash
# Auto-deploy script for InboxGPT
# Triggered by GitHub webhook on push to main

set -e

APP_DIR="/home/james/InboxGPT"
LOG_FILE="/home/james/InboxGPT/deploy.log"

echo "=== Deploy started at $(date) ===" >> "$LOG_FILE"

cd "$APP_DIR"

# Pull latest
git fetch origin main
git reset --hard origin/main

# Install deps
npm install --production=false >> "$LOG_FILE" 2>&1

# Build
npm run build >> "$LOG_FILE" 2>&1

# Restart app
pm2 restart inboxgpt >> "$LOG_FILE" 2>&1

echo "=== Deploy finished at $(date) ===" >> "$LOG_FILE"
