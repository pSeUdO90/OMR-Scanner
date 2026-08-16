#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp deploy/env.example .env
  echo "Created .env from deploy/env.example — edit OMR_SITE to your domain, then re-run."
fi

docker compose up -d --build
docker compose ps
echo
echo "Health: curl -sS http://127.0.0.1/api/health"
echo "Login:  admin / admin  (change this after first sign-in)"
