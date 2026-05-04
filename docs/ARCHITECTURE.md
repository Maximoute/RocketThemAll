# 🏗️ Architecture

Understanding RocketThemAll's structure and design patterns.

## Project Layout

```
RocketThemAll/
├── services/                    # Backend services
│   ├── api/                    # REST API (@rta/api)
│   │   ├── src/
│   │   │   ├── server.ts       # Express setup
│   │   │   ├── middleware/     # Auth, error handling, rate limiting
│   │   │   ├── routes/         # API endpoints
│   │   │   └── utils/          # Helpers
│   │   └── package.json
│   │
│   └── bot/                    # Discord Bot (@rta/bot)
│       ├── src/
│       │   ├── index.ts        # Bot setup
│       │   ├── commands/       # Slash commands
│       │   └── jobs/           # Background jobs (spawning)
│       └── package.json
│
├── web/
│   └── app/                    # Next.js Web App (@rta/web)
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   ├── components/     # React components
│       │   └── lib/            # Utilities & Auth
│       └── package.json
│
├── libs/                        # Shared libraries
│   ├── database/               # Prisma (@rta/database)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Data model
│   │   │   └── migrations/     # Database migrations
│   │   └── src/
│   │       └── index.ts        # Prisma client export
│   │
│   ├── services/               # Business Logic (@rta/services)
│   │   ├── src/
│   │   │   ├── *.service.ts    # Service classes
│   │   │   ├── errors.ts       # Custom errors
│   │   │   └── index.ts        # Exports
│   │   └── tests/              # Unit tests
│   │
│   ├── shared/                 # Types & Utils (@rta/shared)
│   │   ├── src/
│   │   │   ├── types.ts        # Shared types
│   │   │   ├── constants.ts    # Constants
│   │   │   └── index.ts        # Exports
│   │   └── package.json
│   │
│   └── importers/              # Data Import (@rta/importers)
│       ├── src/
│       │   ├── *Importer.ts    # Import implementations
│       │   ├── rarityService.ts    # Rarity logic
│       │   ├── transformService.ts # Transform logic
│       │   └── index.ts        # Exports
│       └── pop/                # Pop culture data
│
├── docker/                      # Docker configuration
│   ├── api.Dockerfile
│   ├── bot.Dockerfile
│   ├── web.Dockerfile
│   └── minio-init.Dockerfile
│
├── scripts/                     # CLI scripts
│   ├── init-pokemon.ts
│   ├── import-*.ts
│   └── ...
│
├── docker-compose.yml          # Local dev stack
└── package.json               # Root workspace config
```

## Monorepo Structure (npm workspaces)

```
Root package.json
└── workspaces:
    ├── services/* → api, bot
    ├── web/*      → app
    └── libs/*     → database, services, shared, importers
```

Each package has:
- Independent `package.json`
- Independent TypeScript config
- Versioned at `@rta/namespace`

Example:
```json
{
  "name": "@rta/api",
  "version": "1.0.0",
  "dependencies": {
    "@rta/database": "*",
    "@rta/services": "*"
  }
}
```

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Discord                               │
│           (Commands from 1000+ users)                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    Discord Bot                              │
│  @rta/bot                                                   │
│  ├─ Handles /capture, /inventory, /trade commands          │
│  ├─ Validates user permissions                             │
│  ├─ Calls API or services directly                         │
│  └─ Responds with embeds                                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌────────────────────────┐           ┌─────────────────────────┐
│   REST API             │           │   Business Services     │
│   @rta/api             │           │   @rta/services         │
│                        │           │                         │
│ ├─ Express server      │           │ ├─ CaptureService       │
│ ├─ Route handlers      │           │ ├─ TradeService        │
│ ├─ Auth middleware     │           │ ├─ InventoryService    │
│ └─ Request validation  │           │ ├─ XpService           │
│                        │           │ ├─ EconomyService      │
│ Routes:                │           │ └─ ...                 │
│ ├─ GET /cards          │           │                         │
│ ├─ POST /trades        │           │ Handles:               │
│ ├─ PATCH /users/:id    │           │ ├─ Game logic          │
│ ├─ POST /images/*      │           │ ├─ Validation          │
│ └─ ...                 │           │ ├─ Transactions        │
│                        │           │ └─ Error handling       │
└────────────────────────┘           └─────────────────────────┘
        │                                    │
        └────────────────────┬───────────────┘
                             │
        ┌────────────────────┴───────────────┐
        │                                    │
        ▼                                    ▼
┌──────────────────────┐          ┌──────────────────┐
│   PostgreSQL         │          │   MinIO (S3)     │
│   @rta/database      │          │                  │
│                      │          │ ├─ Card images   │
│ ├─ Cards             │          │ └─ User uploads  │
│ ├─ Users             │          └──────────────────┘
│ ├─ Trades            │
│ ├─ Inventory         │
│ ├─ Logs              │
│ └─ Config            │
└──────────────────────┘
```

## Service Layer Architecture

All business logic lives in `@rta/services`. Each service is a class:

```typescript
// Example: CaptureService
export class CaptureService {
  async capture(userId: string, channelId: string, cardName: string) {
    // 1. Validate input
    // 2. Check cooldown
    // 3. Find card
    // 4. Award to user
    // 5. Log action
    // 6. Return result
  }
}

// Usage in API route
async (req, res) => {
  const captureService = new CaptureService();
  const result = await captureService.capture(...);
  res.json(result);
}

// Usage in Discord bot
const captureService = new CaptureService();
await captureService.capture(userId, channelId, cardName);
```

### Service Pattern Benefits

✅ **Centralized Logic** - All game rules in one place
✅ **Testable** - Unit tests don't need DB or API
✅ **Reusable** - Both API and bot use same logic
✅ **Type-Safe** - TypeScript catches errors early

## Database Schema

Key tables in PostgreSQL:

```sql
-- Core Tables
Card              -- All available cards
├─ id, name, imageUrl
├─ deck (Pokemon | PopCulture | RocketLeague)
├─ rarity (Common, Uncommon, Rare...)
├─ source (pokeapi, tmdb, manual)
└─ sourceId (external API ID)

User              -- Bot/Web users
├─ id (Discord ID)
├─ username
├─ email
├─ credits, xp, level
└─ discordAvatar

InventoryItem     -- Cards owned by users
├─ userId, cardId
├─ quantity
└─ variant (normal, shiny, holo)

Trade             -- Player-to-player trades
├─ id, user1Id, user2Id
├─ status (pending, completed, cancelled)
├─ expiresAt
└─ items (array of TradeItem)

Logs              -- Audit trail
├─ id, action, userId
├─ target, metadata
└─ createdAt
```

### Migrations

Located at `libs/database/prisma/migrations/`:

```
migrations/
├── 20260430190430_init/
│   └── migration.sql          # Initial schema
├── 20260501200000_add_spawn_system/
│   └── migration.sql          # Added spawn features
└── ...
```

Each migration is timestamped and versioned.

## Authentication & Authorization

### NextAuth (Web)

```
Web App (Port 3000)
    ↓
NextAuth middleware
    ↓
Discord OAuth2
    ↓
JWT session in cookie
    ↓
Authenticated user
```

Session object:
```typescript
{
  user: {
    id: "12345",           // Discord ID
    name: "username",
    email: "user@discord", 
    image: "avatar_url"
  },
  expires: "2025-06-04"
}
```

### API Auth

Discord bot calls API directly (no auth needed locally).
For production, add JWT token validation:

```typescript
// Middleware
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;
  next();
});
```

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│          Docker Container Layer         │
├─────────────────────────────────────────┤
│                                         │
│  ├─ API Container                      │
│  │  └─ npm run -w @rta/api start       │
│  │                                     │
│  ├─ Bot Container                      │
│  │  └─ npm run -w @rta/bot start       │
│  │                                     │
│  ├─ Web Container                      │
│  │  └─ npm run -w @rta/web start       │
│  │                                     │
│  ├─ PostgreSQL Container               │
│  │  └─ Database layer                  │
│  │                                     │
│  └─ MinIO Container                    │
│     └─ File storage layer              │
│                                         │
└─────────────────────────────────────────┘
```

Each service has multi-stage Docker builds:
1. **Dependencies stage** - Install npm packages
2. **Builder stage** - Compile TypeScript
3. **Development stage** - With hot-reload (dev only)
4. **Production stage** - Lean runtime image

## Error Handling

Centralized error class in `@rta/services`:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public metadata?: any
  ) {
    super(message);
  }
}

// Usage
throw new AppError("Card not found", 404);
throw new AppError("Insufficient cards", 409, { required: 5, have: 3 });
```

Error middleware catches and formats:

```typescript
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      metadata: err.metadata
    });
  }
  res.status(500).json({ error: 'Internal server error' });
});
```

## Performance Considerations

### Database
- ✅ Prisma client auto-batches queries
- ✅ Connection pooling via PgBouncer (production)
- ✅ Indexed fields: userId, cardId, source
- ✅ Transactions for multi-step operations

### API
- ✅ Rate limiting (10 req/min per user)
- ✅ Gzip compression
- ✅ Redis caching for hot data (optional)

### Web
- ✅ Next.js image optimization
- ✅ Code splitting & lazy loading
- ✅ SSR for SEO
- ✅ ISR (Incremental Static Generation)

### Bot
- ✅ Command cooldowns (5 seconds)
- ✅ Efficient Discord API calls
- ✅ Background jobs for spawning

## Testing Strategy

```
libs/services/tests/
├── xp.test.ts          # XP calculation
├── level.test.ts       # Level thresholds
├── trade.test.ts       # Trade logic
└── capture.test.ts     # Capture mechanics
```

Tests use **Vitest** and test only the service layer (no DB/API).

## Security

- ✅ **Input validation** - Zod schemas for all inputs
- ✅ **SQL injection** - Prisma ORM prevents this
- ✅ **XSS** - React auto-escapes content
- ✅ **CSRF** - NextAuth handles CSRF tokens
- ✅ **Rate limiting** - Express middleware
- ✅ **OAuth2** - Discord OAuth2 for auth
- ✅ **Env secrets** - Never committed to git

---

For detailed implementation, see source files. Questions? Open an issue!
