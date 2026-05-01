# RocketThemAll - Discord Card Collector Monorepo

Projet full-stack TypeScript pour un bot Discord de collection de cartes avec application web utilisateur/admin, API backend, PostgreSQL, Prisma et stockage S3 compatible (MinIO local).

## Stack

- TypeScript
- Node.js
- Discord.js
- Next.js
- NextAuth (Discord OAuth2)
- PostgreSQL
- Prisma ORM
- Docker + Docker Compose
- MinIO (S3 compatible)
- Vitest

## Architecture

```txt
apps/
	bot/
	web/
	api/

packages/
	database/
	services/
	shared/

docker/
	postgres/
	minio/

.env.example
docker-compose.yml
README.md
```

## Fonctionnalites cle

- Bot Discord:
	- /capture <nom>
	- /inventory
	- /profile
	- /cardinfo <nom>
	- /leaderboard
	- /booster open
	- /trade start @user
	- /trade add <trade_id> <carte>
	- /trade remove <trade_id> <carte>
	- /trade confirm <trade_id>
	- /trade cancel <trade_id>
- Spawn automatique dans un salon Discord
- XP/level avec formule: xpRequired = floor(100 * level^1.5)
- Boosters (3 Common, 1 Uncommon, 1 Rare+)
- Trade securise avec double confirmation + expiration + logs
- Web app utilisateur:
	- /login
	- /profile
	- /inventory
	- /collection
	- /trades
- Web app admin:
	- /admin
	- /admin/cards
	- /admin/users
	- /admin/inventories
	- /admin/logs
	- /admin/imports
	- /admin/config
- Import image semi-auto depuis URL vers MinIO + workflow ImportJob

## Variables d'environnement

Copier .env.example vers .env et remplir:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_GUILD_ID=
DISCORD_SPAWN_CHANNEL_ID=
ADMIN_ROLE_ID=

DATABASE_URL=postgresql://collector:collector@postgres:5432/collector

S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=card-images
S3_PUBLIC_URL=http://localhost:9000/card-images

NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
API_BASE_URL=http://api:4000
```

## Setup Discord Bot

1. Creer une application Discord Developer Portal.
2. Activer bot + OAuth2.
3. Recuperer:
	 - DISCORD_TOKEN
	 - DISCORD_CLIENT_ID
	 - DISCORD_CLIENT_SECRET
	 - DISCORD_GUILD_ID
	 - DISCORD_SPAWN_CHANNEL_ID
4. Inviter le bot avec scope bot + applications.commands.

## Setup OAuth Discord (NextAuth)

1. Dans OAuth2 redirect URI Discord, ajouter:
	 - http://localhost:3000/api/auth/callback/discord
2. Renseigner DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET.
3. Definir NEXTAUTH_SECRET et NEXTAUTH_URL.

## Lancement Docker

```bash
docker compose up -d postgres minio minio-init
```

Ou lancer toute la stack:

```bash
docker compose up
```

## Installation & Prisma

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Lancement projet

Terminal 1 (API):

```bash
npm run -w @rta/api dev
```

Terminal 2 (BOT):

```bash
npm run -w @rta/bot dev
```

Terminal 3 (WEB):

```bash
npm run -w @rta/web dev
```

## 🎮 Import Pokémon (1000+ cartes)

### Option 1 : Auto-Import au Démarrage (Recommandé)

L'API vérifie automatiquement si les Pokémon sont importés. Si la BD est vide, l'import se lance tout seul :

```bash
docker-compose up -d
# L'API détecte que la BD est vide
# ✅ Lance automatiquement l'import de 1000+ Pokémon + variantes Shiny
# ⏳ ~5-15 minutes
# ✅ API ready après import
```

### Option 2 : Import Manuel via API

```bash
# Importer TOUS les Pokémon (1000+) + Shiny variants
curl -X POST http://localhost:4000/admin/init-pokemon

# Response:
# {
#   "success": true,
#   "count": 1234,
#   "message": "Pokémon initialization complete! 1234 cards imported."
# }
```

### Option 3 : Import via CLI

```bash
npm run init:pokemon
# ou
pnpm ts-node scripts/init-pokemon.ts
```

### Ce qui est Importé

✅ **Tous les Pokémon** (1000+ depuis PokéAPI)
✅ **Noms Français** (Salamèche, Dracaufeu, etc. avec accents)
✅ **Variantes Shiny** (✨ Shiny - beaucoup plus rares)
✅ **Images Officielles** (depuis GitHub et PokéAPI)
✅ **Rareté Intelligente** :
  - Légendaires → Black Market
  - Starters → Rare
  - Pikachu → Very Rare
  - Shiny → Exotic/Black Market
✅ **Déduplication** (pas de doublons si redémarrage)

### Timeline Déploiement

```
docker-compose up -d
    ↓ (30s)
PostgreSQL ready
    ↓
API startup
    ↓
✅ Check: Pokémon in DB? → NON
    ↓
🚀 AUTO-IMPORT LANCÉ
    ├─ Fetch 1000+ Pokémon
    ├─ + Variantes Shiny
    ├─ Noms français
    └─ Insert en BD
    ↓ (5-15 min selon Internet)
✅ 1000-1500 cartes importées
✅ API listening on 4000
```

### Variables d'Environnement (Optionnelles)

```env
# Pour importer aussi les films depuis TMDB
TMDB_API_KEY=your_key_here

# Pour importer les jeux depuis IGDB
IGDB_API_KEY=your_key_here
```

## API Backend

Routes principales:

- GET /cards
- POST /cards
- PATCH /cards/:id
- DELETE /cards/:id
- GET /users
- GET /users/:id/inventory
- PATCH /users/:id/inventory
- POST /trades
- PATCH /trades/:id
- POST /images/upload
- POST /images/import-url
- GET /logs
- GET /config
- PATCH /config
- **POST /admin/init-pokemon** ← Import 1000+ Pokémon

Toute la logique metier reside dans packages/services.

## Tests

```bash
npm run test
```

Couverture incluse:

- XP
- Level
- Booster
- Trade
- Capture
- Inventaire

## Notes de scalabilite

- Monorepo decouple apps et logique metier
- Services metier centralises dans packages/services
- Prisma pour coherence transactionnelle
- Structure prete pour workers/files de jobs
- Logs centralises (CaptureLog/AdminLog)
