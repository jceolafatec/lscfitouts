#!/usr/bin/env bash
# pi-setup.sh — run this ON THE RASPBERRY PI after the first deploy.
# It installs backend dependencies, writes the Nginx config, and
# restarts the systemd service.
#
# Usage (from your Mac):
#   ssh jceola@192.168.1.205 'bash /media/jceola/Dev/dockerdata/lscdrafting/pi-setup.sh'

set -e

BACKEND_DIR="/media/jceola/Dev/dockerdata/lscdrafting/backend"
FRONTEND_DIR="/media/jceola/Dev/dockerdata/lscdrafting/frontend"
PROJECTS_DIR="/media/jceola/Dev/dockerdata/lscdrafting/projects"   # symlink or copy
SERVICE_FILE="/etc/systemd/system/node-backend.service"
NGINX_CONF="/etc/nginx/sites-available/lscfitouts"

# ── 1. Install Node dependencies ─────────────────────────────────────────────
echo "==> Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install --omit=dev

# ── 2. Write systemd service ──────────────────────────────────────────────────
echo "==> Writing systemd unit..."
sudo tee "$SERVICE_FILE" > /dev/null << SERVICE
[Unit]
Description=LSC Fitouts Node Backend
After=network.target

[Service]
Type=simple
User=jceola
WorkingDirectory=$BACKEND_DIR
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=PORT=3100
Environment=HOST=127.0.0.1
Environment=PROJECTS_ROOT=$PROJECTS_DIR
Environment=FRONTEND_ROOT=$FRONTEND_DIR

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable node-backend
sudo systemctl restart node-backend
echo "==> node-backend service restarted."

# ── 3. Write Nginx config ─────────────────────────────────────────────────────
echo "==> Writing Nginx config..."
sudo tee "$NGINX_CONF" > /dev/null << NGINX
server {
    listen 80;
    server_name _;

    # --- Static project assets (GLB, PDF, images) ---
    # Served directly by Nginx for performance; avoids routing through Node.
    location /projects/ {
        alias $PROJECTS_DIR/;
        expires 7d;
        add_header Cache-Control "public";
        try_files \$uri =404;
    }

    # --- API — proxy to Node/Express backend ---
    location /api/ {
        proxy_pass         http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # --- React SPA (built static files) ---
    location / {
        root   $FRONTEND_DIR;
        index  index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/lscfitouts
sudo nginx -t && sudo systemctl reload nginx
echo "==> Nginx reloaded."

echo ""
echo "Setup complete! Visit http://192.168.1.205 to verify."
