# 🔌 API Reference

Complete REST API documentation for RocketThemAll.

## Base URL

```
http://localhost:4000
```

## Authentication

Currently, the local API has no authentication (Discord bot calls it internally).

For production, add Bearer token:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

## Common Response Formats

### Success (2xx)
```json
{
  "data": {...},
  "message": "Operation successful"
}
```

### Error (4xx, 5xx)
```json
{
  "error": "Error message",
  "statusCode": 400,
  "metadata": {...}
}
```

## Cards Endpoints

### List All Cards
```
GET /cards
```

Query parameters:
- `deck` - Filter by deck (Pokemon, PopCulture, RocketLeague)
- `rarity` - Filter by rarity
- `source` - Filter by source (pokeapi, tmdb, manual)
- `search` - Search by name
- `limit` - Results per page (default: 20)
- `offset` - Pagination offset

Response:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Bulbasaur",
      "deck": "Pokemon",
      "rarity": "Common",
      "imageUrl": "https://...",
      "xpReward": 10,
      "dropRate": 50,
      "source": "pokeapi",
      "sourceId": "pokemon-1"
    }
  ],
  "total": 1234,
  "limit": 20,
  "offset": 0
}
```

### Get Card by ID
```
GET /cards/:id
```

### Create Card (Admin)
```
POST /cards
```

Request body:
```json
{
  "name": "Custom Card",
  "deck": "Pokemon",
  "rarity": "Rare",
  "imageUrl": "https://...",
  "xpReward": 40,
  "dropRate": 12
}
```

### Update Card (Admin)
```
PATCH /cards/:id
```

### Delete Card (Admin)
```
DELETE /cards/:id
```

## Users Endpoints

### Get User by ID
```
GET /users/:id
```

Response:
```json
{
  "data": {
    "id": "discord-id",
    "username": "user123",
    "email": "user@discord",
    "credits": 1000,
    "xp": 5000,
    "level": 10,
    "discordAvatar": "https://...",
    "createdAt": "2026-05-04T..."
  }
}
```

### Get All Users (Admin)
```
GET /users
```

Query parameters: `limit`, `offset`, `search`

## Inventory Endpoints

### Get User Inventory
```
GET /users/:userId/inventory
```

Response:
```json
{
  "data": [
    {
      "id": "uuid",
      "cardId": "card-uuid",
      "card": {...},
      "quantity": 3,
      "variant": "normal",
      "acquiredAt": "2026-05-04T..."
    }
  ]
}
```

### Update Inventory (Internal)
```
PATCH /users/:userId/inventory
```

## Trades Endpoints

### Create Trade
```
POST /trades
```

Request body:
```json
{
  "user1Id": "discord-id-1",
  "user2Id": "discord-id-2"
}
```

Response:
```json
{
  "data": {
    "id": "trade-uuid",
    "user1Id": "...",
    "user2Id": "...",
    "status": "pending",
    "user1Confirm": false,
    "user2Confirm": false,
    "expiresAt": "2026-05-04T12:00:00Z",
    "createdAt": "2026-05-04T..."
  }
}
```

### Add Item to Trade
```
POST /trades/:tradeId/items
```

Request body:
```json
{
  "userId": "discord-id",
  "cardId": "card-uuid",
  "quantity": 1,
  "variant": "normal"  // normal, shiny, holo
}
```

### Remove Item from Trade
```
DELETE /trades/:tradeId/items/:itemId
```

### Confirm Trade
```
PATCH /trades/:tradeId/confirm
```

Request body:
```json
{
  "userId": "discord-id"
}
```

### Cancel Trade
```
DELETE /trades/:tradeId
```

Request body:
```json
{
  "userId": "discord-id"
}
```

## Image/File Endpoints

### Upload Card Image
```
POST /images/upload
```

Multipart form data:
- `file` - Image file (PNG, JPG, WebP)
- `cardId` - Associated card ID (optional)

Response:
```json
{
  "data": {
    "url": "https://minio-url/...",
    "size": 12345,
    "uploadedAt": "2026-05-04T..."
  }
}
```

### Import from URL
```
POST /images/import-url
```

Request body:
```json
{
  "url": "https://external-url/image.png",
  "cardId": "card-uuid"
}
```

## Import Endpoints

### Import Pokémon
```
POST /admin/init-pokemon
```

Query parameters:
- `limit` - Number of Pokémon to import (default: all)

Response:
```json
{
  "data": {
    "imported": 151,
    "skipped": 0,
    "errors": [],
    "duration": "5m 30s"
  },
  "message": "Successfully imported 151 Pokémon"
}
```

### Import from TMDB (Movies)
```
POST /import/movies
```

Query parameters:
- `pages` - Number of pages to import (default: 1)

### Import Pop Culture
```
POST /import/pop
```

## Logs Endpoints

### Get Activity Logs
```
GET /logs
```

Query parameters:
- `action` - Filter by action type
- `userId` - Filter by user
- `limit` - Results per page
- `offset` - Pagination offset

Response:
```json
{
  "data": [
    {
      "id": "uuid",
      "action": "CARD_CAPTURED",
      "userId": "discord-id",
      "target": "card-id",
      "metadata": {"rarity": "Rare"},
      "createdAt": "2026-05-04T..."
    }
  ]
}
```

## Config Endpoints

### Get Configuration
```
GET /config
```

Response:
```json
{
  "data": {
    "captureCooldownS": 5,
    "tradeTtlMinutes": 600,
    "maxInventorySize": 1000,
    "spawnIntervalSeconds": 300,
    "xpMultiplier": 1.0
  }
}
```

### Update Configuration (Admin)
```
PATCH /config
```

Request body (partial updates):
```json
{
  "captureCooldownS": 10,
  "xpMultiplier": 1.5
}
```

## Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| 400 | Bad Request | Missing required field |
| 401 | Unauthorized | Invalid/missing auth token |
| 403 | Forbidden | User not authorized for action |
| 404 | Not Found | Card/User/Trade doesn't exist |
| 409 | Conflict | Card already exists, insufficient items |
| 429 | Too Many Requests | Rate limited |
| 500 | Internal Error | Server error |

## Rate Limiting

- **Limit**: 100 requests per minute per IP
- **Header**: `X-RateLimit-Remaining`

Example:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1620000060
```

## Webhook Events (Future)

Planned webhook events:
- `trade.created`
- `trade.completed`
- `card.captured`
- `user.levelup`

---

For more details, check the source in `services/api/src/routes/`.
