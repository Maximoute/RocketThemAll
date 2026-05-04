# 🚀 Getting Started

This guide will help you set up RocketThemAll for local development in 5 minutes.

## Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **Docker** - [Download](https://www.docker.com/)
- **Discord Server** - Create one for testing
- **Discord Developer Account** - [dev.discord.com](https://dev.discord.com/)
- **Git** - For cloning the repository

## Step 1: Discord Bot Setup

### Create a Bot Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Name it "RocketThemAll" (or your preferred name)
4. Go to **Bot** tab → **Add Bot**
5. Under **TOKEN**, click **Copy** and save it as `DISCORD_TOKEN`

### Configure OAuth2

1. Go to **OAuth2** → **URL Generator**
2. Under **Scopes**, select:
   - `bot`
   - `applications.commands`
3. Under **Permissions**, select:
   - `Send Messages`
   - `Embed Links`
   - `Attach Files`
   - `Read Message History`
   - `Manage Channels` (optional, for spawn channel)
4. Copy the generated URL and **invite your bot to your server**

### Get Required IDs

1. In your Discord server, enable **Developer Mode** (User Settings → Advanced)
2. Right-click your server name → **Copy Server ID** → Save as `DISCORD_GUILD_ID`
3. Right-click the channel where cards spawn → **Copy Channel ID** → Save as `DISCORD_SPAWN_CHANNEL_ID`
4. Create a role for admins → **Copy Role ID** → Save as `ADMIN_ROLE_ID`

Get your OAuth2 credentials:
1. Go back to **OAuth2** → **General**
2. Copy **Client ID** → Save as `DISCORD_CLIENT_ID`
3. Copy **Client Secret** → Save as `DISCORD_CLIENT_SECRET`

## Step 2: Clone Repository

```bash
git clone https://github.com/yourusername/RocketThemAll.git
cd RocketThemAll
```

## Step 3: Environment Setup

```bash
# Copy example environment
cp .env.example .env

# Edit .env with your values
nano .env  # or use your editor
```

Your `.env` should look like:

```env
# Discord Bot
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_guild_id
DISCORD_SPAWN_CHANNEL_ID=spawn_channel_id
ADMIN_ROLE_ID=admin_role_id

# Database (no changes needed for local dev)
DATABASE_URL=postgresql://collector:collector@postgres:5432/collector

# MinIO S3 Storage (no changes needed for local dev)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=card-images
S3_PUBLIC_URL=http://localhost:9000/card-images

# NextAuth
NEXTAUTH_SECRET=your_generated_secret_here
NEXTAUTH_URL=http://localhost:3000
API_BASE_URL=http://api:4000
```

### Generate NEXTAUTH_SECRET

```bash
# On macOS/Linux:
openssl rand -base64 32

# On Windows PowerShell:
[Convert]::ToBase64String([System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes(32))
```

## Step 4: Start Docker Services

```bash
# Start PostgreSQL and MinIO
docker-compose up -d postgres minio minio-init

# Verify services are running
docker-compose ps
```

You should see:
- ✅ rta-postgres
- ✅ rta-minio
- ✅ rta-minio-init

## Step 5: Install Dependencies & Initialize Database

```bash
# Install all npm dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# (Optional) Seed with sample data
npm run prisma:seed
```

## Step 6: Import Card Data

### Option A: Auto-Import (Recommended)

The system auto-imports when the database is empty:

```bash
# Just start the API - it will auto-import 1000+ Pokémon
npm run -w @rta/api dev
```

### Option B: Manual Import

```bash
# Import specific dataset
npm run init:pokemon          # 1000+ Pokémon
npm run import:pop:all        # All Pop Culture data
npm run import:rocket-league:items  # Rocket League items
```

## Step 7: Start Development Services

Open 3 terminal windows:

**Terminal 1 - API Server**
```bash
npm run -w @rta/api dev
# Output: ✅ API listening on http://localhost:4000
```

**Terminal 2 - Discord Bot**
```bash
npm run -w @rta/bot dev
# Output: ✅ Bot logged in as RocketThemAll#0000
```

**Terminal 3 - Web Application**
```bash
npm run -w @rta/web dev
# Output: ✅ Ready - http://localhost:3000
```

## Verify Everything Works

### Test the Bot

1. Go to your Discord server
2. Type `/capture bulbasaur` 
3. The bot should respond with the card details

### Test the API

```bash
# Get all cards
curl http://localhost:4000/cards

# Should return a JSON list of cards
```

### Test the Web App

1. Open http://localhost:3000
2. Click **Sign In** → **Discord**
3. Authorize the application
4. You should see your inventory

## 🎉 Success!

You have a working local environment! 

### What's Next?

- 📖 Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the codebase
- 🔧 See [DEVELOPMENT.md](./DEVELOPMENT.md) for development workflow
- 🚀 Check [API.md](./API.md) for API documentation
- 🤖 Read [BOT.md](./BOT.md) for bot commands

## 🆘 Troubleshooting

### "Database connection refused"
```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart services
docker-compose restart postgres
```

### "Bot not responding to commands"
- Ensure bot has `applications.commands` scope
- Check `DISCORD_TOKEN` and `DISCORD_GUILD_ID` in .env
- Restart bot: `npm run -w @rta/bot dev`

### "Web app shows 500 error"
- Check if API is running on port 4000
- Check if `INTERNAL_API_URL` is correct in .env
- Check browser console for errors

### "Cards not importing"
```bash
# Check database connection
npm run prisma:migrate status

# Check database has tables
docker-compose exec postgres psql -U collector -d collector -c "\dt"
```

### "MinIO console not accessible"
- Verify MinIO is running: `docker-compose ps`
- Go to http://localhost:9001
- Login with: minioadmin / minioadmin

## Useful Commands

```bash
# View logs
docker-compose logs -f postgres
docker-compose logs -f minio

# Access database shell
docker-compose exec postgres psql -U collector -d collector

# Reset everything
docker-compose down -v  # ⚠️ Deletes data!
docker-compose up -d
npm run prisma:migrate
npm run init:pokemon

# Update dependencies
npm install
npm run prisma:generate
```

## Development Tips

1. **Use VS Code extensions**:
   - Prisma
   - Discord.js IntelliSense
   - Thunder Client (for API testing)

2. **Enable TypeScript strict mode** - Catch errors early

3. **Use prettier for formatting** - Automatic code formatting

4. **Check logs frequently** - Most issues show in logs

5. **Hot reload** - Changes automatically reload in dev mode

---

**Happy developing! 🚀**
