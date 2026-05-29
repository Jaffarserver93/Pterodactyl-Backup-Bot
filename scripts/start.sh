#!/usr/bin/env bash
set -e

# Start API server in background (port 8080)
pnpm --filter @workspace/api-server run dev &
API_PID=$!

# Start frontend on port 5000 (Replit webview port)
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/ptero-backup-bot exec vite \
  --config vite.config.ts --host 0.0.0.0 &
FRONT_PID=$!

# Kill both on exit
trap "kill $API_PID $FRONT_PID 2>/dev/null; exit" INT TERM EXIT

wait $API_PID $FRONT_PID
