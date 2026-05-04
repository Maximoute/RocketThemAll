# Card Importer System

Système complet d'import de cartes depuis des APIs externes.

## Architecture

```
packages/importers/          # Logique d'import réutilisable
├── src/
│   ├── pokemonImporter.ts   # Import Pokémon API
│   ├── tmdbImporter.ts      # Import TMDB (films/séries)
│   ├── igdbImporter.ts      # Import IGDB (jeux) - stub
│   ├── rarityService.ts     # Logique de rareté
│   ├── transformService.ts  # Transformation en cartes internes
│   ├── types.ts             # Types partagés
│   └── index.ts             # Exports

scripts/                      # Scripts CLI pour lancer les imports
├── import-pokemon.ts
├── import-movies.ts
└── import-games.ts

apps/api/routes/import/       # Routes API pour les imports
```

## Sources d'API

### Pokémon
- **API** : https://pokeapi.co/api/v2/pokemon
- **Limit** : Premier 151 (Génération 1)
- **Rareté** :
  - Pokémon légendaires → Black Market
  - Starters → Rare
  - Pikachu → Very Rare
  - Autres → Common/Uncommon aléatoire

### Films & Séries (TMDB)
- **API** : https://api.themoviedb.org/3/movie/popular
- **Clé API** : Définie via `TMDB_API_KEY` (env)
- **Rareté** : Basée sur la popularité
  - > 100 popularity → Exotic
  - > 50 → Rare
  - > 20 → Uncommon
  - < 20 → Common

### Jeux (IGDB)
- **Stub** : À implémenter
- **Clé API** : `IGDB_API_KEY`

## Utilisation

### Via CLI

```bash
# Importer 151 Pokémon
pnpm ts-node scripts/import-pokemon.ts

# Importer 3 pages de films (60 films)
pnpm ts-node scripts/import-movies.ts

# Importer jeux (non implémenté)
pnpm ts-node scripts/import-games.ts
```

### Via API

```bash
# Importer Pokémon
curl -X POST http://localhost:4000/import/pokemon \
  -H "Content-Type: application/json" \
  -d '{"limit": 151}'

# Importer films (3 pages)
curl -X POST http://localhost:4000/import/movies \
  -H "Content-Type: application/json" \
  -d '{"pages": 3}'
```

### Via Discord Bot

```
/admin import source:pokemon limit:151
/admin import source:movies limit:3
```

## Format de Carte Interne

Chaque carte importée est transformée en ce format :

```typescript
{
  name: string                              // Nom de la carte
  deck: "Pokemon" | "Pop Culture" | "Rocket League-like"
  rarityId: string                          // ID de rareté (BD)
  imageUrl: string                          // URL de l'image
  description?: string                      // Description optionnelle
  xpReward: number                          // XP gagné
  dropRate: number                          // Chance d'apparition
  source: string                            // Source (pokeapi, tmdb)
  sourceId?: string                         // ID externe
}
```

## Rareté & XP

| Rareté | XP | Drop Rate |
|--------|----|----|
| Common | 10 | 50% |
| Uncommon | 20 | 22% |
| Rare | 40 | 12% |
| Very Rare | 70 | 7% |
| Import | 110 | 4% |
| Exotic | 160 | 3% |
| Black Market | 250 | 1% |
| Limited | 300 | 1% |

## Déduplication

Le système utilise `sourceId` pour éviter les doublons :
- Pokémon : `pokemon-{id}`
- Films : `movie-{id}`

Avant insertion, le système vérifie si la carte existe déjà.

## Variables d'Environnement

```env
# TMDB (requis pour les films)
TMDB_API_KEY=your_api_key

# IGDB (optionnel)
IGDB_API_KEY=your_api_key
```

## Logs

Chaque import produit des logs détaillés :

```
🔄 Importing 151 Pokémon from PokéAPI...
✅ Imported: Bulbasaur (Pokemon)
✅ Imported: Charmander (Pokemon)
⏭️  Pikachu already exists, skipping...
...
✨ Pokémon import complete! 149 new cards added.
```

## Architecture du Code

### pokemonImporter.ts
- Fetch la liste des Pokémon
- Pour chaque Pokémon : récupère les détails
- Transforme en carte interne
- Insère en BD avec déduplica tion

### tmdbImporter.ts
- Pagine les résultats populaires
- Transforme chaque film
- Insère en BD

### rarityService.ts
- `generatePokemonRarity()` : Détermine la rareté Pokémon
- `generateMovieRarity()` : Détermine la rareté film
- `getXpReward()` : XP par rareté
- `getDropRate()` : Chance par rareté

### transformService.ts
- `transformPokemonToCard()` : Pokémon → Card
- `transformMovieToCard()` : Film → Card

## Erreurs Courantes

**API Timeout**
```
❌ PokéAPI Error: Request timeout
```
→ Vérifier la connexion réseau

**Card Already Exists**
```
⏭️  Pikachu already exists, skipping...
```
→ Normal, déduplica tion active

**TMDB API Key Missing**
```
⚠️  TMDB_API_KEY not set. Set it to import movies.
```
→ Définir `TMDB_API_KEY` dans `.env`

## Exemple Complet

```typescript
// import-custom.ts
import { importPokemon, importMovies } from "@rta/importers";

async function importAll() {
  console.log("🚀 Starting full import...");
  
  const pokemonCount = await importPokemon(151);
  console.log(`✅ ${pokemonCount} Pokémon imported`);
  
  const moviesCount = await importMovies(1, 5);
  console.log(`✅ ${moviesCount} movies imported`);
  
  console.log("✨ All imports complete!");
}

importAll().catch(console.error);
```

## Prochaines Étapes

- [ ] Implémenter IGDB importer
- [ ] Ajouter système de retry avec backoff exponentiel
- [ ] Cache API pour éviter les requêtes répétées
- [ ] Webhook Discord pour logs détaillés
- [ ] Dashboard admin avec historique des imports
