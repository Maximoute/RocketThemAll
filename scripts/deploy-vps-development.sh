#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

IMAGE_TAG="${1:?Usage: deploy-vps-development.sh <40-character-image-tag> <image-prefix>}"
IMAGE_PREFIX="${2:?Usage: deploy-vps-development.sh <40-character-image-tag> <image-prefix>}"
DEPLOY_ROOT="${RTA_DEV_DEPLOY_ROOT:-/srv/rocketthemall-dev}"
RELEASE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ROOT}/shared/.env.development"
PRODUCTION_ENV_FILE="/srv/rocketthemall/shared/.env.production"

read_env_value() {
  local file="$1"
  local key="$2"
  if [[ "${file}" == "${PRODUCTION_ENV_FILE}" ]]; then
    sudo sed -n "s/^${key}=//p" "${file}" | tail -n 1
  else
    sed -n "s/^${key}=//p" "${file}" | tail -n 1
  fi
}

if [[ ! "${IMAGE_TAG}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid immutable image tag: expected a full Git commit SHA." >&2
  exit 2
fi
if [[ ! "${IMAGE_PREFIX}" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+$ ]]; then
  echo "Invalid GHCR image prefix." >&2
  exit 2
fi
if [[ "${RELEASE_DIR}" != "${DEPLOY_ROOT}/releases/${IMAGE_TAG}" ]]; then
  echo "Release directory does not match the requested development image tag." >&2
  exit 2
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}; install independent development secrets first." >&2
  exit 3
fi
if grep -Eq '=(replace-me|replace-with-|change-me)' "${ENV_FILE}"; then
  echo "The development environment still contains placeholder values." >&2
  exit 3
fi

environment_name="$(read_env_value "${ENV_FILE}" RTA_ENVIRONMENT)"
database_name="$(read_env_value "${ENV_FILE}" POSTGRES_DB)"
admin_discord_id="$(read_env_value "${ENV_FILE}" RTA_DEVELOPMENT_ADMIN_DISCORD_ID)"
if [[ "${environment_name}" != "development" ]]; then
  echo "RTA_ENVIRONMENT must be exactly development." >&2
  exit 3
fi
if [[ ! "${database_name}" =~ (^|[_-])dev(elopment)?$ ]]; then
  echo "POSTGRES_DB must visibly identify the development database." >&2
  exit 3
fi
if [[ ! "${admin_discord_id}" =~ ^[0-9]{17,20}$ ]]; then
  echo "RTA_DEVELOPMENT_ADMIN_DISCORD_ID must be a Discord snowflake." >&2
  exit 3
fi

# Fail closed if any sensitive development credential was copied from production.
if sudo test -f "${PRODUCTION_ENV_FILE}"; then
  while IFS=':' read -r development_key production_key; do
    development_value="$(read_env_value "${ENV_FILE}" "${development_key}")"
    production_value="$(read_env_value "${PRODUCTION_ENV_FILE}" "${production_key}")"
    if [[ -n "${development_value}" && "${development_value}" == "${production_value}" ]]; then
      echo "Development credential ${development_key} must differ from production." >&2
      exit 3
    fi
  done <<'KEYS'
POSTGRES_PASSWORD:POSTGRES_PASSWORD
NEXTAUTH_SECRET:NEXTAUTH_SECRET
S3_SECRET_KEY:S3_SECRET_KEY
DISCORD_CLIENT_ID_DEV:DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET_DEV:DISCORD_CLIENT_SECRET
KEYS
fi

chmod 0600 "${ENV_FILE}"
install -d -m 0750 "${DEPLOY_ROOT}/backups"
export RTA_IMAGE_PREFIX="${IMAGE_PREFIX}"
export RTA_IMAGE_TAG="${IMAGE_TAG}"

COMPOSE=(
  docker compose
  --project-name rta-dev
  --env-file "${ENV_FILE}"
  --file "${RELEASE_DIR}/docker-compose.development.yml"
)

"${COMPOSE[@]}" config --quiet
printf '%s\n' "${IMAGE_TAG}" > "${RELEASE_DIR}/.image-tag"

PREVIOUS_RELEASE=""
if [[ -L "${DEPLOY_ROOT}/current" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "${DEPLOY_ROOT}/current" || true)"
fi

rollback() {
  local exit_code=$?
  trap - ERR
  echo "Development deployment failed; attempting rollback." >&2
  if [[ -n "${PREVIOUS_RELEASE}" && -f "${PREVIOUS_RELEASE}/.image-tag" ]]; then
    export RTA_IMAGE_TAG="$(<"${PREVIOUS_RELEASE}/.image-tag")"
    docker compose \
      --project-name rta-dev \
      --env-file "${ENV_FILE}" \
      --file "${PREVIOUS_RELEASE}/docker-compose.development.yml" \
      up -d --no-build --wait --wait-timeout 180 || true
  fi
  exit "${exit_code}"
}
trap rollback ERR

if docker inspect rta-dev-postgres-1 >/dev/null 2>&1; then
  backup_path="${DEPLOY_ROOT}/backups/postgres-before-${IMAGE_TAG}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  docker exec rta-dev-postgres-1 sh -ec \
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -9 > "${backup_path}"
  chmod 0600 "${backup_path}"
  echo "Development database backup created before migration."
fi

"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 240

health_payload="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:18081/api/health)"
if [[ "${health_payload}" != *"${IMAGE_TAG}"* ]]; then
  echo "Development health endpoint does not report the expected image tag." >&2
  exit 4
fi

# The existing production Caddy owns ports 80/443. Only its dedicated dev
# virtual host is retargeted; production hosts continue to use `nginx:8080`.
CADDY_CONTAINER="${RTA_DEV_CADDY_CONTAINER:-rta-caddy-1}"
caddy_config="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "${CADDY_CONTAINER}")"
if [[ ! "${caddy_config}" =~ ^/srv/rocketthemall/releases/[0-9a-f]{40}/docker/caddy/Caddyfile$ ]]; then
  echo "Unable to resolve the expected production Caddyfile mount safely." >&2
  exit 4
fi
if ! sudo grep -q '^dev\.rocketthemall\.com {' "${caddy_config}"; then
  echo "The production Caddyfile has no dedicated development virtual host." >&2
  exit 4
fi
caddy_backup="${caddy_config}.before-rta-dev"
sudo cp --preserve=mode,ownership "${caddy_config}" "${caddy_backup}"
sudo sed -i '/^dev\.rocketthemall\.com {/,/^}/ s/reverse_proxy nginx:8080/reverse_proxy rta-dev-nginx:8080/' "${caddy_config}"
if ! sudo grep -A8 '^dev\.rocketthemall\.com {' "${caddy_config}" | grep -q 'reverse_proxy rta-dev-nginx:8080'; then
  sudo mv "${caddy_backup}" "${caddy_config}"
  echo "Failed to retarget only the development virtual host." >&2
  exit 4
fi
if ! docker exec "${CADDY_CONTAINER}" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  sudo mv "${caddy_backup}" "${caddy_config}"
  echo "Retargeted Caddy configuration is invalid; original restored." >&2
  exit 4
fi
docker kill --signal=SIGUSR1 "${CADDY_CONTAINER}" >/dev/null
sudo rm -f "${caddy_backup}"

ln -sfn "${RELEASE_DIR}" "${DEPLOY_ROOT}/.current-next"
mv -Tf "${DEPLOY_ROOT}/.current-next" "${DEPLOY_ROOT}/current"
printf '%s\n' "${IMAGE_TAG}" > "${DEPLOY_ROOT}/shared/.deployed-tag"
"${COMPOSE[@]}" ps

trap - ERR
docker image prune --all --force --filter label=com.docker.compose.project=rta-dev
docker builder prune --all --force
echo "Development deployment ${IMAGE_TAG} completed successfully."
