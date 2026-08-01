import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("admin authorization has no username lookup fallback", async () => {
  const [webAuth, makeAdmin] = await Promise.all([
    source("packages/auth/src/web-auth.ts"),
    source("scripts/make-admin.ts")
  ]);

  assert.doesNotMatch(webAuth, /where\s*:\s*\{\s*username\b/);
  assert.doesNotMatch(makeAdmin, /--username\b/);
  assert.doesNotMatch(makeAdmin, /where\s*:\s*\{\s*username\b/);
});

test("admin navigation and layouts fail closed for regular users", async () => {
  const [navigation, adminLayout] = await Promise.all([
    source("apps/web/src/components/nav.tsx"),
    source("apps/web/src/app/admin/layout.tsx")
  ]);

  assert.match(navigation, /session\?\.user\?\.isAdmin\s*===\s*true/);
  assert.doesNotMatch(navigation, /status\s*===\s*["']authenticated["']\s*&&\s*link\(["']\/admin/);
  assert.match(adminLayout, /await\s+requireAdmin\(\)/);
});

test("the web image optimizer cannot fetch remote URLs", async () => {
  const nextConfig = await source("apps/web/next.config.mjs");
  assert.match(nextConfig, /remotePatterns\s*:\s*\[\s*\]/);
  assert.doesNotMatch(nextConfig, /hostname\s*:/);
});

test("arbitrary remote image download/import is absent", async () => {
  const [serviceExports, cardRoutes] = await Promise.all([
    source("packages/services/src/index.ts"),
    source("apps/api/src/routes/cards.routes.ts")
  ]);

  assert.doesNotMatch(serviceExports, /image\.service|ImageService|uploadFromUrl/);
  assert.doesNotMatch(cardRoutes, /router\.post\(\s*["']\/import["']/);
  assert.doesNotMatch(cardRoutes, /imageUrl\s*:\s*z\.string\(\)\.url/);
});

test("development Compose does not hard-code credential fields", async () => {
  const compose = await source("docker-compose.yml");
  assert.doesNotMatch(compose, /^\s*POSTGRES_PASSWORD:\s*collector\s*$/m);
  assert.doesNotMatch(compose, /^\s*MINIO_ROOT_PASSWORD:\s*minioadmin\s*$/m);
  assert.doesNotMatch(compose, /^\s*WORDPRESS_DB_PASSWORD:\s*wordpress\s*$/m);
});

test("production services never receive MinIO root credentials", async () => {
  const compose = await source("docker-compose.production.yml");
  assert.match(compose, /S3_ACCESS_KEY:\s*\$\{S3_ACCESS_KEY:\?/);
  assert.match(compose, /S3_SECRET_KEY:\s*\$\{S3_SECRET_KEY:\?/);
  assert.doesNotMatch(compose, /S3_ACCESS_KEY:\s*\$\{MINIO_ROOT_USER/);
  assert.doesNotMatch(compose, /S3_SECRET_KEY:\s*\$\{MINIO_ROOT_PASSWORD/);
  assert.match(compose, /rta-card-images/);
  assert.match(compose, /must be distinct from MinIO root credentials/);
});

test("production PostgreSQL starts unprivileged without gosu", async () => {
  const dockerfile = await source("docker/postgres/Dockerfile");
  assert.match(dockerfile, /rm -f \/usr\/local\/bin\/gosu/);
  assert.match(dockerfile, /USER 999:70/);
});
