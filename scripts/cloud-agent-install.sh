#!/usr/bin/env bash
set -euo pipefail

# Idempotent Cloud Agent install. Safe on revisions that do not yet have
# Python/Node manifests (empty main) and on this app's full tree.
cd "$(dirname "$0")/.."

# Default Ubuntu images ship python3 without ensurepip, so `python3 -m venv`
# fails unless python3-venv is installed first.
if ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends python3-venv python3-pip
fi

# Recreate a partial venv left behind by a previous failed install.
if [[ ! -x .venv/bin/python ]] || ! .venv/bin/python -c 'import pip' >/dev/null 2>&1; then
  rm -rf .venv
  python3 -m venv .venv
fi

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
