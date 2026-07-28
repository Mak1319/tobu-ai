#!/bin/sh
set -eu

MINIO_ROOT_USER="${MINIO_ROOT_USER:-admin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-admin12345}"
MINIO_ENDPOINT="minio:9000"

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_NOTIFY_CHANNEL="${REDIS_NOTIFY_CHANNEL:-minio.documents.uploaded}"
BUCKETS="${BUCKETS:-documents-bucket,processed-documents}"

trim() {
  s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Wait for MinIO.
i=0
while [ "$i" -lt 60 ]; do
  if mc alias set local "http://${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1 \
     && mc ready local >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
[ "$i" -lt 60 ] || { echo "[minio-init] MinIO never became ready"; exit 1; }
echo "[minio-init] MinIO is ready."

# Create buckets first (works regardless of notify config).
OLD_IFS="$IFS"
IFS=","
for bucket in ${BUCKETS}; do
  IFS="$OLD_IFS"
  b=$(trim "$bucket")
  [ -z "$b" ] && IFS="," && continue
  if mc ls "local/${b}" >/dev/null 2>&1; then
    echo "[minio-init] ${b}: exists"
  else
    mc mb "local/${b}" && echo "[minio-init] ${b}: created"
  fi
  IFS=","
done
IFS="$OLD_IFS"

# Register the notify_redis target at runtime.
echo "[minio-init] Registering notify_redis target -> ${REDIS_HOST}:${REDIS_PORT} ..."
if [ -n "${REDIS_PASSWORD}" ]; then
  mc admin config set local notify_redis:1 \
    address="${REDIS_HOST}:${REDIS_PORT}" \
    key="${REDIS_NOTIFY_CHANNEL}" \
    format="namespace" \
    password="${REDIS_PASSWORD}"
else
  mc admin config set local notify_redis:1 \
    address="${REDIS_HOST}:${REDIS_PORT}" \
    key="${REDIS_NOTIFY_CHANNEL}" \
    format="namespace"
fi
echo "[minio-init] notify_redis target registered. Restarting MinIO to load it ..."

mc admin service restart local

# Wait for MinIO to come back.
i=0
while [ "$i" -lt 60 ]; do
  if mc ready local >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
[ "$i" -lt 60 ] || { echo "[minio-init] MinIO did not come back after restart"; exit 1; }
mc alias set local "http://${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
echo "[minio-init] MinIO is back up."

# Attach the put-event listener on documents-bucket.
mc event remove "local/documents-bucket" --force >/dev/null 2>&1 || true
mc event add "local/documents-bucket" \
  arn:minio:sqs::1:redis --event put --ignore-existing

echo "[minio-init] listeners on documents-bucket:"
mc event list "local/documents-bucket"
echo "[minio-init] done."
