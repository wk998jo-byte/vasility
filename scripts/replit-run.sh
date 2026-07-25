#!/usr/bin/env bash
# Replit Preview/Run entrypoint — one process owns :8080.
set -euo pipefail

echo "[replit-run] Preparing Preview on :8080"
# Stop leftovers from Shell `npm start` or a previous Run.
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -t -i:8080 -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${PIDS}" ]; then
    echo "[replit-run] Killing listeners on 8080: ${PIDS}"
    kill -9 ${PIDS} 2>/dev/null || true
  fi
fi
pkill -9 -f "node server/index.js" 2>/dev/null || true
pkill -9 -f "node server/prestart-free-port.js" 2>/dev/null || true
sleep 1

if lsof -i:8080 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[replit-run] ERROR: :8080 still busy after kill"
  lsof -i:8080 || true
  exit 1
fi

echo "[replit-run] Building frontend…"
npm run build:web

echo "[replit-run] Starting server…"
export PORT=8080
exec npm start
