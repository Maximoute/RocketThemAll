#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

INPUT_FILE="${1:?Usage: bootstrap-vps-development.sh <oauth-input-file>}"
DEPLOY_ROOT="${RTA_DEV_DEPLOY_ROOT:-/srv/rocketthemall-dev}"
ENV_FILE="${DEPLOY_ROOT}/shared/.env.development"
TEMP_FILE="${ENV_FILE}.new.$$"

cleanup() {
  rm -f "${INPUT_FILE}" "${TEMP_FILE}"
}
trap cleanup EXIT

if [[ ! "${INPUT_FILE}" =~ ^${DEPLOY_ROOT}/shared/\.oauth-bootstrap-[0-9a-f]{40}$ ]]; then
  echo "Invalid OAuth bootstrap input path." >&2
  exit 2
fi
if [[ ! -f "${INPUT_FILE}" ]]; then
  echo "Missing OAuth bootstrap input." >&2
  exit 2
fi
chmod 0600 "${INPUT_FILE}"

read_input() {
  local key="$1"
  sed -n "s/^${key}=//p" "${INPUT_FILE}" | tail -n 1
}

discord_client_id="$(read_input DISCORD_CLIENT_ID_DEV)"
discord_client_secret="$(read_input DISCORD_CLIENT_SECRET_DEV)"
admin_discord_id="$(read_input RTA_DEVELOPMENT_ADMIN_DISCORD_ID)"

if [[ ! "${discord_client_id}" =~ ^[0-9]{17,20}$ ]]; then
  echo "DISCORD_CLIENT_ID_DEV must be a Discord snowflake." >&2
  exit 2
fi
if [[ ! "${discord_client_secret}" =~ ^[A-Za-z0-9._-]{20,128}$ ]]; then
  echo "DISCORD_CLIENT_SECRET_DEV has an unexpected format." >&2
  exit 2
fi
if [[ ! "${admin_discord_id}" =~ ^[0-9]{17,20}$ ]]; then
  echo "RTA_DEVELOPMENT_ADMIN_DISCORD_ID must be a Discord snowflake." >&2
  exit 2
fi

install -d -m 0750 "${DEPLOY_ROOT}/shared" "${DEPLOY_ROOT}/releases" "${DEPLOY_ROOT}/backups"

if [[ -f "${ENV_FILE}" ]]; then
  grep -Ev '^(DISCORD_CLIENT_ID_DEV|DISCORD_CLIENT_SECRET_DEV|RTA_DEVELOPMENT_ADMIN_DISCORD_ID)=' "${ENV_FILE}" > "${TEMP_FILE}"
else
  postgres_password="$(openssl rand -hex 32)"
  minio_root_password="$(openssl rand -hex 32)"
  s3_access_key="rta_dev_$(openssl rand -hex 10)"
  s3_secret_key="$(openssl rand -hex 32)"
  nextauth_secret="$(openssl rand -base64 48 | tr -d '\n')"
  printf '%s\n' \
    'RTA_ENVIRONMENT=development' \
    'POSTGRES_USER=rta_dev' \
    "POSTGRES_PASSWORD=${postgres_password}" \
    'POSTGRES_DB=rta_dev' \
    'MINIO_ROOT_USER=rta_dev_root' \
    "MINIO_ROOT_PASSWORD=${minio_root_password}" \
    "S3_ACCESS_KEY=${s3_access_key}" \
    "S3_SECRET_KEY=${s3_secret_key}" \
    "NEXTAUTH_SECRET=${nextauth_secret}" \
    > "${TEMP_FILE}"
fi

printf '%s\n' \
  "DISCORD_CLIENT_ID_DEV=${discord_client_id}" \
  "DISCORD_CLIENT_SECRET_DEV=${discord_client_secret}" \
  "RTA_DEVELOPMENT_ADMIN_DISCORD_ID=${admin_discord_id}" \
  >> "${TEMP_FILE}"
chmod 0600 "${TEMP_FILE}"
mv -f "${TEMP_FILE}" "${ENV_FILE}"
echo "Independent development configuration is ready."
