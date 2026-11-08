#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_NAME="zfx-client"
PROJECT_ROOT="${DEPLOY_BASE_ROOT:?DEPLOY_BASE_ROOT must point to the checked-out project}"
COMPOSE_BASE_FILE="${PROJECT_ROOT}/compose.yml"
