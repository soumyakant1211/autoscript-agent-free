#!/bin/bash
# AWS EC2 setup for AutoScript Agent (Amazon Linux 2023).
# Use as "User data" when launching the instance, or run with sudo after SSH-ing in.
# Before using: replace REPO_URL and the values in the .env block below.
set -euo pipefail

REPO_URL="https://github.com/YOUR-USERNAME/autoscript-agent.git"

dnf install -y docker git
systemctl enable --now docker

rm -rf /opt/autoscript-agent
git clone "$REPO_URL" /opt/autoscript-agent
cd /opt/autoscript-agent

cat > .env <<'ENV'
AI_PROVIDER=gemini
GEMINI_API_KEY=PASTE_YOUR_FREE_GEMINI_KEY
APP_PASSWORD=PICK_A_PASSWORD
RATE_LIMIT_PER_HOUR=20
ENV
chmod 600 .env

docker build -t autoscript-agent .
docker rm -f autoscript-agent 2>/dev/null || true
docker run -d --name autoscript-agent --restart unless-stopped -p 80:8080 --env-file .env autoscript-agent

echo "Done. Open http://<this-instance-public-IP>/"
