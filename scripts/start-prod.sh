#!/usr/bin/env bash
set -e

# Production start — Express serves both the API and the built frontend
# Render sets $PORT automatically; defaults to 8080 if not provided
PORT=${PORT:-8080} NODE_ENV=production node --enable-source-maps \
  artifacts/api-server/dist/index.mjs
