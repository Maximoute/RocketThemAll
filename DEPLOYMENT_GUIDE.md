# 🚀 Déploiement Automatique avec Import 1000+ Pokémon

## Fonctionnement

### 1️⃣ **Auto-Import au Démarrage**

Quand vous lancez l'app, l'API vérifie automatiquement :
```typescript
// Dans server.ts
async function initializeIfNeeded() {
  const pokemonCount = await prisma.card.count({
    where: { source: "pokeapi" }
  });

  if (pokemonCount === 0) {
    console.log("🚀 No Pokémon found. Starting auto-import...");
    const imported = await importPokemon(10000);
    console.log(`✅ Auto-import complete! ${imported} cards added.`);
  }
}
```

### 2️⃣ **Route Admin Manuelle**

Vous pouvez aussi déclencher l'import manuellement :
```bash
POST /admin/init-pokemon
# Response: { success: true, count: 1234, message: "..." }
```

### 3️⃣ **Script CLI**

Exécutez l'import en ligne de commande :
```bash
npm run init:pokemon
# ou
pnpm ts-node scripts/init-pokemon.ts
```

## Timeline du Déploiement

```
Déploiement (docker-compose up -d)
    ↓
Postgres démarrage (30s)
    ↓
API démarrage
    ↓
Vérification: Pokémon dans BD ? NON
    ↓
🚀 Auto-import lancé
    ├─ Fetch 1000+ Pokémon de PokéAPI
    ├─ Récupère noms français
    ├─ Récupère images Shiny
    └─ Insère en BD
    ↓
⏳ ~5-15 minutes selon la connexion
    ↓
✅ 1000-1500 cartes importées
    ↓
API listening on 4000 ✅
```

## Features Intégrées

### ✅ Déduplication
- Vérifie par `sourceId` pour éviter les doublons
- Si cartes déjà importées = skip

### ✅ Noms Français
- Récupère depuis PokéAPI species endpoint
- Accents: é è ç conservés

### ✅ Variantes Shiny
- Ajoute `✨ Shiny` si image existe
- Rareté Shiny = Exotic/Black Market
- XP plus élevé

### ✅ Pagination Smart
- Traite 50 Pokémon à la fois
- Pas de timeout
- Gère 10 000+ Pokémon

## Variables d'Environnement

```env
# Optionnels (pour TMDB et IGDB)
TMDB_API_KEY=your_key
IGDB_API_KEY=your_key

# Pokémon: toujours importé automatiquement
```

## Fichiers Modifiés

- **server.ts** : ajout `initializeIfNeeded()`
- **admin.routes.ts** : nouvelle route `/admin/init-pokemon`
- **init-pokemon.ts** : script CLI
- **package.json** : script `init:pokemon`

## Cas d'Usage

### 🚀 Déploiement Production
```bash
docker-compose up -d
# Automatiquement :
# ✅ Importe 1000+ Pokémon
# ✅ Ajoute variantes Shiny
# ✅ Crée noms français
```

### 🔄 Sync Après Update
```bash
# Lancer l'import manuellement
curl -X POST http://localhost:4000/admin/init-pokemon
```

### 📝 Seed de Données
```bash
npm run init:pokemon
# Exécute l'import avant le démarrage
```

## Optimisations Futures

- [ ] Importer aussi les films TMDB au démarrage
- [ ] Cache API pour éviter les re-requêtes
- [ ] Webhook Discord pour log d'import
- [ ] Barre de progression pour UI
- [ ] Retry automatique en cas d'erreur réseau

## FAQ

**Q: Combien de temps ?**
A: 5-15 minutes selon vitesse Internet (1000 requêtes API)

**Q: Les données sont perdues si on redémarre ?**
A: NON, vérification par `sourceId` = déduplication

**Q: Peut-on désactiver l'auto-import ?**
A: Oui, enlever `initializeIfNeeded()` du server.ts

**Q: Ça bloque le serveur ?**
A: Oui pendant l'import, mais c'est OK pour le démarrage initial
