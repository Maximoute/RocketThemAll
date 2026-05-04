# 🎮 RocketThemAll - Discord Card Collector Bot

A full-stack TypeScript monorepo for a Discord card collection bot with web application, REST API, and automated data import system.

## ✨ What is RocketThemAll?

RocketThemAll is a complete card collection game running on Discord and the web. Users can:
- **Capture** cards from multiple sources (Pokémon, Pop Culture, etc.)
- **Trade** cards with other players (with secure double-confirmation)
- **Collect** and manage inventory
- **Compete** on leaderboards with XP/leveling system
- **Boost** card drops with boosters
- **Trade** in the marketplace

Perfect for Discord communities that want an engaging, gamified experience.

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React 18, TypeScript, NextAuth (Discord OAuth2) |
| **Backend** | Node.js 20, Express, TypeScript |
| **Discord Bot** | Discord.js, TypeScript |
| **Database** | PostgreSQL, Prisma ORM |
| **File Storage** | MinIO (S3-compatible) |
| **DevOps** | Docker, Docker Compose |
| **Testing** | Vitest |
| **Monorepo** | npm workspaces |

## 📦 Project Structure

```
RocketThemAll/
├── services/                # Backend services
│   ├── api/                # Express REST API (port 4000)
│   └── bot/                # Discord bot
├── web/
│   └── app/                # Next.js web application (port 3000)
├── libs/                   # Shared libraries
│   ├── database/           # Prisma + database layer
│   ├── services/           # Business logic layer
│   ├── shared/             # Shared types & utilities
│   └── importers/          # Data import system
├── docker/                 # Docker configuration
│   ├── api.Dockerfile
│   ├── bot.Dockerfile
│   ├── web.Dockerfile
│   └── minio-init.Dockerfile
├── scripts/                # CLI utilities & data imports
├── docker-compose.yml      # Local development setup
└── package.json           # Workspace configuration
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- npm or pnpm
- Discord Bot Token & OAuth2 credentials

### 1. Clone & Setup

```bash
git clone <repo>
cd RocketThemAll
cp .env.example .env
# Fill in Discord credentials and secrets
```

### 2. Start Local Development

```bash
# Start database and storage
docker-compose up -d

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Start all services
npm run dev
```

Services will be available at:
- **API**: http://localhost:4000
- **Web**: http://localhost:3000
- **Bot**: Responds to Discord commands
- **MinIO Console**: http://localhost:9001

## 📚 Documentation

- **[Getting Started](./docs/GETTING_STARTED.md)** - Detailed setup guide
- **[Architecture](./docs/ARCHITECTURE.md)** - Project structure & design
- **[API Reference](./docs/API.md)** - REST API endpoints
- **[Discord Bot](./docs/BOT.md)** - Bot commands & features
- **[Development](./docs/DEVELOPMENT.md)** - Development workflow
- **[Importing Data](./docs/IMPORT_SYSTEM.md)** - Card import system
- **[Deployment](./docs/DEPLOYMENT.md)** - Production deployment

## 🎮 Key Features

### For Users
- ⭐ **Capture** cards through Discord commands or web interface
- 🎯 **Trade** securely with other players
- 📊 **Inventory** management with filtering
- 🏆 **Leaderboard** rankings by XP
- 💰 **Economy** system with credits & fragments
- 🎁 **Boosters** to increase card drop rates
- 🔐 **OAuth2** Discord login for web app

### For Admins
- 📥 **Mass imports** from multiple data sources
- 🎨 **Card management** (create, edit, delete)
- 👥 **User administration** panel
- 📊 **Analytics** and logs
- ⚙️ **Configuration** management

### For Developers
- 🏗️ **Monorepo structure** with shared libraries
- 🔄 **Type-safe** end-to-end with TypeScript
- 🧪 **Well-tested** business logic layer
- 🐳 **Docker-first** development
- 📦 **Extensible** architecture

## 🔧 Common Commands

```bash
# Development
npm run dev              # Start all services in watch mode
npm run build            # Build all packages
npm run test             # Run test suite

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:seed      # Seed database

# Data Import
npm run init:pokemon     # Import 1000+ Pokémon
npm run import:pop:all   # Import all Pop Culture data
```

## 🌐 Environment Variables

Required environment variables are documented in `.env.example`. Key variables:

```env
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_guild_id
DISCORD_SPAWN_CHANNEL_ID=spawn_channel_id

# Database
DATABASE_URL=postgresql://collector:collector@postgres:5432/collector

# Storage (MinIO)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Auth
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

## 📖 API Highlights

### Core Endpoints
- `POST /admin/init-pokemon` - Import 1000+ Pokémon
- `GET /cards` - List all cards
- `GET /users/:id/inventory` - User inventory
- `POST /trades` - Create trade
- `POST /images/upload` - Upload card image

[Full API documentation](./docs/API.md)

## 🤖 Bot Commands

### User Commands
- `/capture <card_name>` - Capture a card
- `/inventory` - View your cards
- `/profile` - View profile
- `/trades` - Manage trades
- `/leaderboard` - View rankings

### Admin Commands
- `/admin import source:pokemon limit:151` - Import cards
- `/admin config` - Configure system

[Full bot documentation](./docs/BOT.md)

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests for specific package
npm run test -w @rta/services

# Watch mode
npm run test -- --watch
```

## 🐳 Docker

Each service has its own multi-stage Dockerfile:
- Development stage with hot-reload (tsx, nodemon)
- Production stage optimized for size

```bash
# Build all images
docker-compose build

# Start development stack
docker-compose up

# Run specific service
docker-compose up api
```

## 🚀 Deployment

See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for production setup including:
- Environment configuration
- Database migrations
- Docker image building
- Scaling considerations

## 📊 System Architecture

```
┌─────────────────────────────────────────┐
│         Discord                         │
│    (Bot Commands & Interactions)        │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│    REST API (@rta/api)                  │
│  (Express, TypeScript)                  │
│  ├─ Card Management                     │
│  ├─ Trade System                        │
│  ├─ User Management                     │
│  └─ File Upload/Import                  │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌───────▼────────┐
│  PostgreSQL    │   │  MinIO (S3)    │
│  (Cards, Users,│   │  (Card Images) │
│   Trades, Logs)│   └────────────────┘
└────────────────┘

┌──────────────────────────────────────────┐
│     Web Application (@rta/web)           │
│     (Next.js, React, TypeScript)         │
│  ├─ User Dashboard                       │
│  ├─ Inventory Management                 │
│  ├─ Trading Interface                    │
│  ├─ Admin Panel                          │
│  └─ NextAuth (Discord OAuth2)            │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│     Shared Libraries                     │
│  ├─ @rta/database (Prisma)               │
│  ├─ @rta/services (Business Logic)       │
│  ├─ @rta/shared (Types)                  │
│  └─ @rta/importers (Data Import)         │
└──────────────────────────────────────────┘
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for guidelines.

## 📝 License

[Add your license here]

## 🆘 Support

- 📖 Check [GETTING_STARTED.md](./docs/GETTING_STARTED.md) for setup issues
- 🐛 Report bugs on GitHub Issues
- 💬 Ask questions in Discussions

## 🎯 Roadmap

- [ ] WebSocket real-time updates
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Seasonal events & challenges
- [ ] Guild-based competitions
- [ ] Custom card deck creation

---

**Happy collecting! 🎮✨**
