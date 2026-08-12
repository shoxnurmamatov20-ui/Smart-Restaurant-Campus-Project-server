#!/usr/bin/env bash
# ============================================================
# Smart Restaurant Campus — Backup script (PostgreSQL + MinIO + Redis snapshot)
# Run via cron: 0 3 * * * /srv/restaurant-campus/infrastructure/scripts/backup.sh
# ============================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/restaurant-campus/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

log() { echo -e "\033[1;34m[backup]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }

mkdir -p "$BACKUP_DIR"/{postgres,minio,redis}

# ============ PostgreSQL dump ============
log "PostgreSQL dump..."
PG_DUMP_FILE="$BACKUP_DIR/postgres/campus_${TIMESTAMP}.sql.gz"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U restaurant_campus -d restaurant_campus --clean --if-exists \
    | gzip > "$PG_DUMP_FILE"
log "  → $PG_DUMP_FILE ($(du -h "$PG_DUMP_FILE" | cut -f1))"

# Encrypt (optional — uncomment if BACKUP_ARCHIVE_PASSWORD is set)
# if [[ -n "${BACKUP_ARCHIVE_PASSWORD:-}" ]]; then
#     openssl enc -aes-256-cbc -salt -pbkdf2 -in "$PG_DUMP_FILE" -out "$PG_DUMP_FILE.enc" -pass pass:"$BACKUP_ARCHIVE_PASSWORD"
#     rm "$PG_DUMP_FILE"
# fi

# ============ MinIO mirror ============
log "MinIO bucket mirror..."
MINIO_BACKUP="$BACKUP_DIR/minio/campus_${TIMESTAMP}.tar.gz"
docker compose -f "$COMPOSE_FILE" exec -T minio \
    tar czf - /data/restaurant-campus 2>/dev/null > "$MINIO_BACKUP" || true
log "  → $MINIO_BACKUP ($(du -h "$MINIO_BACKUP" | cut -f1))"

# ============ Redis snapshot (BGSAVE) ============
log "Redis snapshot..."
docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE >/dev/null
sleep 5
REDIS_BACKUP="$BACKUP_DIR/redis/dump_${TIMESTAMP}.rdb"
docker compose -f "$COMPOSE_FILE" cp redis:/data/dump.rdb "$REDIS_BACKUP"
log "  → $REDIS_BACKUP ($(du -h "$REDIS_BACKUP" | cut -f1))"

# ============ Cleanup old backups ============
log "O'chirib tashlash: $RETENTION_DAYS kundan oldingilari..."
find "$BACKUP_DIR" -type f -name "*.gz" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name "*.rdb" -mtime +"$RETENTION_DAYS" -delete

log "============================================================"
log "Backup tugadi. Hajm: $(du -sh "$BACKUP_DIR" | cut -f1)"
log "============================================================"
