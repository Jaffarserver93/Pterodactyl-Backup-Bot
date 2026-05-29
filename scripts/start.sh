#!/usr/bin/env bash
# Services are managed by the individual artifact workflows
# (artifacts/api-server: API Server  and  artifacts/ptero-backup-bot: web)
# This script simply keeps the Project workflow alive until the user stops it.
echo "[PteroBot] Services are starting via their dedicated workflows..."
echo "[PteroBot] API server  -> port 8080"
echo "[PteroBot] Frontend    -> port 21884"
sleep infinity
