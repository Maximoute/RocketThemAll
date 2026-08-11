#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

IMAGE_TAG="${1:?Usage: deploy-vps.sh <40-character-image-tag> <image-prefix>}"
IMAGE_PREFIX="${2:?Usage: deploy-vps.sh <40-character-image-tag> <image-prefix>}"
DEPLOY_ROOT="${RTA_DEPLOY_ROOT:-/srv/rocketthemall}"
RELEASE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ROOT}/shared/.env.production"
VAULT_ROOT="${DEPLOY_ROOT}/shared/Vault-RTA"

if [[ ! "${IMAGE_TAG}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid immutable image tag: expected a full Git commit SHA." >&2
  exit 2
fi
if [[ ! "${IMAGE_PREFIX}" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+$ ]]; then
  echo "Invalid GHCR image prefix." >&2
  exit 2
fi
if [[ "${RELEASE_DIR}" != "${DEPLOY_ROOT}/releases/${IMAGE_TAG}" ]]; then
  echo "Release directory does not match the requested image tag." >&2
  exit 2
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Production secrets must be installed on the VPS first." >&2
  exit 3
fi
if grep -Eq '=(replace-me|replace-with-|change-me)' "${ENV_FILE}"; then
  echo "The production environment still contains placeholder values." >&2
  exit 3
fi
for catalog in \
  "_data/cards.csv" \
  "_data/notion_bdd/BDD - Zones.csv" \
  "_data/notion_bdd/BDD - Items.csv" \
  "_data/notion_bdd/BDD - Quetes.csv" \
  "_data/notion_bdd/BDD - Achievements.csv" \
  "_data/notion_bdd/BDD - Bosses.csv" \
  "_data/notion_bdd/BDD - Competences.csv"; do
  if [[ ! -f "${VAULT_ROOT}/${catalog}" ]]; then
    echo "Missing production Vault catalog: ${VAULT_ROOT}/${catalog}" >&2
    exit 3
  fi
done

chmod 0600 "${ENV_FILE}"
export RTA_IMAGE_PREFIX="${IMAGE_PREFIX}"
export RTA_IMAGE_TAG="${IMAGE_TAG}"
export BUILD_SHA="${IMAGE_TAG}"

COMPOSE=(
  docker compose
  --project-name rta
  --env-file "${ENV_FILE}"
  --file "${RELEASE_DIR}/docker-compose.production.yml"
  --file "${RELEASE_DIR}/docker-compose.registry.yml"
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
  echo "Deployment failed; attempting application rollback." >&2
  if [[ -n "${PREVIOUS_RELEASE}" && -f "${PREVIOUS_RELEASE}/.image-tag" ]]; then
    export RTA_IMAGE_TAG="$(<"${PREVIOUS_RELEASE}/.image-tag")"
    docker compose \
      --project-name rta \
      --env-file "${ENV_FILE}" \
      --file "${PREVIOUS_RELEASE}/docker-compose.production.yml" \
      --file "${PREVIOUS_RELEASE}/docker-compose.registry.yml" \
      up -d --no-build --remove-orphans --wait --wait-timeout 180 || true
  fi
  exit "${exit_code}"
}
trap rollback ERR

if docker inspect rta-postgres-1 >/dev/null 2>&1; then
  backup_path="${DEPLOY_ROOT}/backups/postgres-before-${IMAGE_TAG}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  docker exec rta-postgres-1 sh -ec \
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -9 > "${backup_path}"
  chmod 0600 "${backup_path}"
  echo "Database backup created before migration."
fi

"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --no-build --remove-orphans --wait --wait-timeout 240
"${COMPOSE[@]}" exec -T api node -e \
  "fetch('http://127.0.0.1:4000/health/ready').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ln -sfn "${RELEASE_DIR}" "${DEPLOY_ROOT}/.current-next"
mv -Tf "${DEPLOY_ROOT}/.current-next" "${DEPLOY_ROOT}/current"
printf '%s\n' "${IMAGE_TAG}" > "${DEPLOY_ROOT}/shared/.deployed-tag"
"${COMPOSE[@]}" ps

trap - ERR
# Active containers retain every layer they need; this only removes superseded
# immutable images and build cache. Persistent volumes are never pruned.
docker image prune --all --force
docker builder prune --all --force
echo "Deployment ${IMAGE_TAG} completed successfully."
