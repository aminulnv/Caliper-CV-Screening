#!/usr/bin/env bash
# One-time EC2 host setup for Caliper (Ubuntu). Run as ubuntu with sudo.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx

# Docker Engine + Compose plugin
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "Docker: $(docker --version)"
echo "Next: clone repo, copy deploy/ec2/*.example env files, run migrate, then docker compose -f docker-compose.prod.yml up -d --build"
echo "Then: sudo cp deploy/nginx/caliper.conf.example /etc/nginx/sites-available/caliper && sudo ln -sf /etc/nginx/sites-available/caliper /etc/nginx/sites-enabled/ && sudo certbot --nginx -d YOUR_DOMAIN"
