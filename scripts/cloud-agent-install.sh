#!/usr/bin/env bash
set -euo pipefail

# Idempotent Cloud Agent install. Safe on revisions that do not yet have
# Python/Node manifests (empty main) and on this app's full tree.
cd "$(dirname "$0")/.."

python3 -m venv .venv
.venv/bin/pip install --upgrade pip

if [[ -f backend/requirements.txt ]]; then
  .venv/bin/pip install -r backend/requirements.txt
elif [[ -f requirements.txt ]]; then
  .venv/bin/pip install -r requirements.txt
else
  echo "No Python requirements found; skipping pip install."
fi

if [[ -f frontend/package.json ]]; then
  if [[ -f frontend/package-lock.json ]]; then
    (cd frontend && npm ci)
  else
    (cd frontend && npm install)
  fi
  (cd frontend && npm run build)
fi

echo "Install complete."
