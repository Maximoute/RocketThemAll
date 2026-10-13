# Rocket Them All

Rocket Them All (RTA) est un jeu de collection et de progression piloté par Discord, avec site joueur/admin, API, worker persistant, PostgreSQL et stockage S3 compatible.

Le dépôt est un monorepo npm TypeScript. Les règles métier déterministes vivent dans un moteur indépendant; les mutations économiques passent par des transactions, un ledger, des clés d’idempotence et une outbox.

## Architecture

```text
apps/
  api/          API Express, santé et administration interne
  bot/          commandes et interactions Discord
  web/          application Next.js et OAuth Discord
  worker/       jobs planifiés et publication de l’outbox
packages/
  auth/         gardes API, Discord et web
  database/     schéma, migrations et client Prisma
  game-engine/  règles pures, probabilités et progression
  services/     cas d’usage transactionnels
  shared/       constantes et types partagés
docs/
  ai-context/   contexte produit et technique persistant
  audit/        inventaires et rapports générés
```

## Prérequis

- Node.js 22.17.1 ou une version Node 22 compatible;
- npm avec support des workspaces;
- PostgreSQL 16;
- un stockage S3 compatible, MinIO en local;
- Docker Compose pour la stack conteneurisée.

## Bac à sable local Docker

La version de développement est exclusivement locale. Elle utilise le projet Compose `rta-sandbox`, des images `rta-sandbox-*`, un réseau interne et des volumes dédiés. Elle ne rejoint aucun réseau de production et n'utilise aucune image du registre de production.

```bash
npm run sandbox:up
```

Une fois les images construites et les migrations/imports terminés :

- site et passerelle API : `http://localhost:3100` ;
- API directe : `http://localhost:4100/health/ready` ;
- PostgreSQL : `127.0.0.1:55432` ;
- MinIO : `127.0.0.1:59000` ;
- console MinIO : `http://localhost:59001`.

Les ports peuvent être changés dans une copie locale de `.env.sandbox.example`. Pour utiliser OAuth Discord, créer `.env.sandbox` avec une application Discord dédiée et le callback `http://localhost:3100/api/auth/callback/discord`.

```bash
npm run sandbox:status
npm run sandbox:logs
npm run sandbox:down
npm run sandbox:reset   # supprime uniquement les volumes rta-sandbox
```

Le worker est optionnel (`npm run sandbox:full`). Le bot est volontairement désactivé par défaut ; `npm run sandbox:discord` exige `.env.sandbox` afin d'éviter de connecter accidentellement les identifiants de production.

## Installation locale sans Docker

```bash
cp .env.example .env
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

Sous PowerShell, utiliser `Copy-Item .env.example .env`.

`npm run dev` compile d’abord les packages puis lance API, bot, worker et web en parallèle. Le bot exige un `DISCORD_TOKEN` valide. Pour ne lancer qu’un composant:

```bash
npm run -w @rta/api dev
npm run -w @rta/bot dev
npm run -w @rta/worker dev
npm run -w @rta/web dev
```

Le catalogue `Vault-RTA` est l’unique source de cartes. Il contient exactement 810 cartes publiées et remplace intégralement le contenu présent lors de chaque import avec `RTA_REPLACE_CARDS=true`.

## Contrôles

```bash
npm run lint
npm test
npm run prisma:validate
npm run validate:context
npm run build
npm audit --audit-level=high
```

La commande agrégée est:

```bash
npm run check
```

L’audit complet du vault source se relance lorsque `Vault-RTA` est disponible à côté du dépôt:

```bash
npm run audit:vault
```

Il régénère l’index machine, le résumé et l’inventaire de contenu. Le contrôle CI `validate:context` ne dépend pas du vault externe et vérifie les artefacts versionnés.

## Base de données

Le schéma est dans `packages/database/prisma/schema.prisma`.

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
```

En production, utiliser uniquement `migrate deploy`. Ne pas utiliser `migrate dev`. Le replay des migrations et leur plan doivent être testés sur une copie représentative avant mise en production.

## Docker de production

Préparer les secrets:

```bash
cp .env.production.example .env.production
```

Construire et démarrer:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

La composition:

- attend PostgreSQL et MinIO;
- exécute les migrations une seule fois;
- démarre API, worker, bot et web sans installation au démarrage;
- utilise des conteneurs applicatifs non-root et en lecture seule;
- exécute PostgreSQL sans root et sans l'utilitaire `gosu`;
- crée pour RTA un compte MinIO limité au bucket `card-images`, distinct du compte root;
- expose Nginx sur `HTTP_PORT`, 3000 par défaut;
- ne contient ni WordPress ni MySQL.

Le fichier `docker-compose.yml` est le bac à sable local. Il ne doit jamais être lancé sur le VPS de production.

## Santé et exploitation

- `GET /health/live`: processus API actif;
- `GET /health/ready`: connexion PostgreSQL utilisable;
- les logs API/worker sont structurés en JSON;
- `BUILD_SHA` identifie la version;
- `TRUST_PROXY_HOPS=1` est prévu derrière le Nginx fourni;
- les jobs et événements sont loués avec `FOR UPDATE SKIP LOCKED`, reprise de lease et backoff.

L’outbox est durable. Son adaptateur actuel publie dans les logs structurés; brancher le transport externe retenu avant d’annoncer une livraison Discord ou broker garantie.

## Sécurité

- l’identité web exige la concordance entre le Snowflake Discord signé et l’UUID interne; le pseudo n’accorde jamais de droit;
- les droits admin sont rechargés depuis PostgreSQL;
- les mutations économiques critiques sont conditionnelles, journalisées et idempotentes;
- les médias proviennent uniquement du Vault, sans import serveur depuis une URL distante, et l’optimiseur Next.js refuse les URL distantes;
- le Compose local utilise uniquement `127.0.0.1`, des ports non standards et des ressources préfixées `rta-sandbox`;
- l’API borne les corps, le débit, les proxys de confiance et les logs sensibles;
- les images applicatives et PostgreSQL sont refusées par la CI si Trivy trouve une vulnérabilité haute ou critique corrigeable;
- aucun secret réel ne doit être versionné.

## Documentation de référence

Commencer par:

- `docs/ai-context/PROJECT_OVERVIEW.md`;
- `docs/ai-context/TECHNICAL_ARCHITECTURE.md`;
- `docs/ai-context/CONFLICTS_AND_DECISIONS.md`;
- `docs/ai-context/TRACEABILITY_MATRIX.md`;
- `docs/ai-context/PROGRESS.md`;
- `docs/ai-context/DEPLOYMENT_GUIDE.md`.

Les décisions non confirmées restent recensées dans `OPEN_QUESTIONS.md`; elles ne doivent pas être transformées silencieusement en règles de production.
