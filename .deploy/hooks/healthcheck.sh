#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_HOOK_API_VERSION="1"

attempt=0
until compose_cmd exec -T web wget -q -O /dev/null http://127.0.0.1/; do
  attempt=$((attempt + 1))
  if (( attempt >= 10 )); then
    fail "Client-Nginx wurde nach 10 Versuchen nicht erreichbar"
  fi
  sleep 1
done

log_info "Client-Nginx antwortet im Container"
