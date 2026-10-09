#!/bin/bash
# Run on the EC2 instance to pull the latest code and restart: sudo bash /opt/autoscript-agent/deploy/update.sh
set -euo pipefail
cd /opt/autoscript-agent
git pull
docker build -t autoscript-agent .
docker rm -f autoscript-agent
docker run -d --name autoscript-agent --restart unless-stopped -p 80:8080 --env-file .env autoscript-agent
docker image prune -f
echo "Updated."
