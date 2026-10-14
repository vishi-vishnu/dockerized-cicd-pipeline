#!/usr/bin/env bash
# Deploys one image tag on the EC2 server, with an automatic rollback.
#
#   Usage: deploy.sh <image-repo> <tag>
#   Example: deploy.sh devvishnudocker/pulse sha-1a2b3c4
#
# Steps:
#   1. Pull the new image.
#   2. Stop the running container but keep it (renamed to pulse-old).
#   3. Start the new container and call /health until it answers or time runs out.
#   4. Healthy: delete the old container and record "success".
#      Unhealthy: delete the new one, start the old one again, record "rolled_back"
#      (or "failed" on the very first deploy) and exit with an error so the pipeline turns red.
set -euo pipefail

IMAGE_REPO="${1:?usage: deploy.sh <image-repo> <tag>}"
NEW_TAG="${2:?usage: deploy.sh <image-repo> <tag>}"

NAME="pulse"
DATA_DIR="${DATA_DIR:-/opt/pulse}"
HOST_PORT="${HOST_PORT:-80}"
HEALTH_URL="http://127.0.0.1:${HOST_PORT}/health"
HEALTH_TRIES="${HEALTH_TRIES:-20}"   # 20 tries x 3 seconds = 1 minute
HEALTH_WAIT="${HEALTH_WAIT:-3}"
HISTORY="${DATA_DIR}/deployments.log"

# Written by Terraform user data: AWS_REGION and LOG_GROUP for CloudWatch Logs.
if [[ -f "${DATA_DIR}/pulse.env" ]]; then
  # shellcheck disable=SC1091
  source "${DATA_DIR}/pulse.env"
fi

log() { printf '[deploy] %s\n' "$*"; }

record() { # record <status> <previous-tag or empty>
  local prev_json="null"
  [[ -n "$2" ]] && prev_json="\"$2\""
  printf '{"time":"%s","tag":"%s","status":"%s","previous":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NEW_TAG" "$1" "$prev_json" >> "$HISTORY"
}

start_container() { # start_container <tag>
  local log_args=()
  if [[ -n "${LOG_GROUP:-}" && -n "${AWS_REGION:-}" ]]; then
    # Send the container's stdout/stderr straight to CloudWatch Logs.
    log_args=(--log-driver awslogs
      --log-opt "awslogs-region=${AWS_REGION}"
      --log-opt "awslogs-group=${LOG_GROUP}"
      --log-opt "awslogs-stream=${NAME}-$1")
  fi
  docker run -d --name "$NAME" \
    --restart unless-stopped \
    -p "${HOST_PORT}:3000" \
    -e APP_ENV=production \
    -v "${DATA_DIR}:/data:ro" \
    --memory 256m --cpus 0.5 \
    "${log_args[@]}" \
    "${IMAGE_REPO}:$1" >/dev/null
}

is_healthy() {
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    if curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
      log "health check passed (try $i)"
      return 0
    fi
    sleep "$HEALTH_WAIT"
  done
  return 1
}

mkdir -p "$DATA_DIR"
touch "$HISTORY"

# Leftover from an interrupted run
docker rm -f "${NAME}-old" >/dev/null 2>&1 || true

log "pulling ${IMAGE_REPO}:${NEW_TAG}"
docker pull "${IMAGE_REPO}:${NEW_TAG}" >/dev/null

PREV_TAG=""
if docker container inspect "$NAME" >/dev/null 2>&1; then
  PREV_IMAGE="$(docker container inspect --format '{{.Config.Image}}' "$NAME")"
  PREV_TAG="${PREV_IMAGE##*:}"
  log "stopping current version ${PREV_TAG}"
  docker stop "$NAME" >/dev/null
  docker rename "$NAME" "${NAME}-old"
fi

log "starting ${NEW_TAG}"
if start_container "$NEW_TAG" && is_healthy; then
  docker rm -f "${NAME}-old" >/dev/null 2>&1 || true
  record success "$PREV_TAG"
  docker image prune -f >/dev/null || true   # remove dangling layers to save disk
  log "deployed ${NEW_TAG}"
  exit 0
fi

log "new version ${NEW_TAG} is NOT healthy. Last log lines:"
docker logs --tail 30 "$NAME" 2>&1 || true
docker rm -f "$NAME" >/dev/null 2>&1 || true

if [[ -n "$PREV_TAG" ]]; then
  log "rolling back to ${PREV_TAG}"
  docker rename "${NAME}-old" "$NAME"
  docker start "$NAME" >/dev/null
  if is_healthy; then
    log "rollback finished, ${PREV_TAG} is serving traffic again"
  else
    log "WARNING: ${PREV_TAG} did not become healthy either"
  fi
  record rolled_back "$PREV_TAG"
else
  log "no previous version to roll back to"
  record failed ""
fi
exit 1
