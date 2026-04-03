#!/usr/bin/env bash
# deploy.sh — build React and sync backend + frontend to the Pi via SMB share.
# The Pi's backend reads from /media/jceola/Dev/dockerdata/lscdrafting/
# which is mounted on this Mac as /Volumes/share/dockerdata/lscdrafting/

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SMB_BACKEND="/Volumes/share/dockerdata/lscdrafting/backend"
SMB_FRONTEND="/Volumes/share/dockerdata/lscdrafting/frontend"

echo "==> Building React frontend..."
cd "$REPO_ROOT/frontend"
npm run build

echo "==> Syncing backend to Pi (via SMB)..."
rsync -av --delete \
  --exclude='node_modules' \
  "$REPO_ROOT/backend/" \
  "$SMB_BACKEND/"

echo "==> Syncing frontend build to Pi (via SMB)..."
rsync -av --delete \
  "$REPO_ROOT/frontend/dist/" \
  "$SMB_FRONTEND/"

echo ""
echo "Done! The Pi will reload the backend service automatically."
echo "  Backend path : $SMB_BACKEND"
echo "  Frontend path: $SMB_FRONTEND"
echo ""
echo "If the backend doesn't reload: SSH in and run:"
echo "  sudo systemctl restart node-backend"
