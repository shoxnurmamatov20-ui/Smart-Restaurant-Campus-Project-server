#!/usr/bin/env bash
# ============================================================
# CAMPUS — Deployment script
# Pull latest, rebuild affected services, restart, run migrations
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/campus}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

log() { echo -e "\033[1;34m[deploy]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }

cd "$APP_DIR"

log "Git pull..."
git fetch origin
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [[ "$LOCAL_HASH" == "$REMOTE_HASH" ]]; then
    log "Already up to date. Nothing to deploy."
    exit 0
fi

log "Pulling latest changes..."
git pull origin main

log "Building services..."
docker compose -f "$COMPOSE_FILE" build --pull

log "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

log "Waiting for API to be healthy..."
for i in {1..30}; do
    if docker compose -f "$COMPOSE_FILE" exec -T api php artisan inspire >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

log "Running Laravel migrations..."
docker compose -f "$COMPOSE_FILE" exec -T api php artisan migrate --force

log "Clearing caches..."
docker compose -f "$COMPOSE_FILE" exec -T api php artisan optimize:clear
docker compose -f "$COMPOSE_FILE" exec -T api php artisan optimize

log "Restarting queue workers..."
docker compose -f "$COMPOSE_FILE" exec -T api php artisan horizon:terminate

log "Pruning old Docker images..."
docker image prune -f

log "============================================================"
log "Deploy finished. Old: $LOCAL_HASH → New: $REMOTE_HASH"
log "============================================================"
