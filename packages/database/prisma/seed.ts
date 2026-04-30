import { PrismaClient } from "@prisma/client";
import { DECKS, RARITIES } from "@rta/shared";

const prisma = new PrismaClient();

const rarityWeights: Record<string, number> = {
  Common: 50,
  Uncommon: 22,
  Rare: 12,
  "Very Rare": 7,
  Import: 4,
  Exotic: 3,
  "Black Market": 1,
  Limited: 1
};

const sampleCards = [
  // === ENERGIE Pokemon (cartes energie dans le deck Pokemon) ===
  { name: "Energie Feu",        deck: "Pokemon", rarity: "Common",       imageUrl: "https://picsum.photos/seed/energie-feu/400/400",      description: "Une energie de type Feu. Essentielle pour les Pokemon Feu.", xpReward: 10, dropRate: 0.5 },
  { name: "Energie Eau",        deck: "Pokemon", rarity: "Common",       imageUrl: "https://picsum.photos/seed/energie-eau/400/400",      description: "Une energie de type Eau. Pour les Pokemon aquatiques.", xpReward: 10, dropRate: 0.5 },
  { name: "Energie Plante",     deck: "Pokemon", rarity: "Common",       imageUrl: "https://picsum.photos/seed/energie-plante/400/400",   description: "Une energie de type Plante. La nature en carte.", xpReward: 10, dropRate: 0.5 },
  { name: "Energie Electrique", deck: "Pokemon", rarity: "Common",       imageUrl: "https://picsum.photos/seed/energie-elec/400/400",     description: "Une energie electrique. Pour Pikachu et ses amis.", xpReward: 10, dropRate: 0.5 },
  { name: "Energie Normal",     deck: "Pokemon", rarity: "Common",       imageUrl: "https://picsum.photos/seed/energie-normal/400/400",   description: "Une energie normale. Polyvalente.", xpReward: 10, dropRate: 0.5 },
  { name: "Energie Psychique",  deck: "Pokemon", rarity: "Uncommon",     imageUrl: "https://picsum.photos/seed/energie-psy/400/400",      description: "Une energie psychique. Pour Mewtwo et Alakazam.", xpReward: 20, dropRate: 0.22 },
  { name: "Energie Combat",     deck: "Pokemon", rarity: "Uncommon",     imageUrl: "https://picsum.photos/seed/energie-combat/400/400",   description: "Une energie de combat. Pour les Pokemon bagarreurs.", xpReward: 20, dropRate: 0.22 },
  { name: "Energie Double",     deck: "Pokemon", rarity: "Rare",         imageUrl: "https://picsum.photos/seed/energie-double/400/400",   description: "Double energie. Deux fois plus de puissance.", xpReward: 40, dropRate: 0.12 },
  { name: "Energie Arc-en-ciel",deck: "Pokemon", rarity: "Very Rare",    imageUrl: "https://picsum.photos/seed/energie-rainbow/400/400",  description: "L'energie universelle. Compatible avec tous les types.", xpReward: 70, dropRate: 0.07 },

  // === ROCKET LEAGUE-LIKE ===
  { name: "Octane Standard",    deck: "Rocket League-like", rarity: "Common",       imageUrl: "https://picsum.photos/seed/octane-std/400/400",    description: "La version de base de l'Octane. Classique.", xpReward: 10, dropRate: 0.5 },
  { name: "Decal Basique",      deck: "Rocket League-like", rarity: "Common",       imageUrl: "https://picsum.photos/seed/decal-basic/400/400",   description: "Un simple decal sans fioriture.", xpReward: 10, dropRate: 0.5 },
  { name: "Fennec Classic",     deck: "Rocket League-like", rarity: "Uncommon",     imageUrl: "https://picsum.photos/seed/fennec-classic/400/400", description: "Le Fennec dans sa forme originale.", xpReward: 20, dropRate: 0.22 },
  { name: "Octane Legacy",      deck: "Rocket League-like", rarity: "Rare",         imageUrl: "https://picsum.photos/seed/octane-legacy/400/400",  description: "Car body iconique, edition collection.", xpReward: 40, dropRate: 0.12 },
  { name: "Dominus Classique",  deck: "Rocket League-like", rarity: "Rare",         imageUrl: "https://picsum.photos/seed/dominus-classic/400/400",description: "Le Dominus original, sobre et efficace.", xpReward: 40, dropRate: 0.12 },
  { name: "TW Octane",          deck: "Rocket League-like", rarity: "Very Rare",    imageUrl: "https://picsum.photos/seed/tw-octane/400/400",      description: "Titanium White Octane. Tres convoite.", xpReward: 70, dropRate: 0.07 },
  { name: "Hellfire",           deck: "Rocket League-like", rarity: "Import",       imageUrl: "https://picsum.photos/seed/hellfire-rl/400/400",    description: "Le decal de feu le plus iconique.", xpReward: 110, dropRate: 0.04 },
  { name: "Dominus GT",         deck: "Rocket League-like", rarity: "Exotic",       imageUrl: "https://picsum.photos/seed/dominus-gt/400/400",     description: "Rouage exotique pour les vrais joueurs.", xpReward: 160, dropRate: 0.03 },
  { name: "Toon Explosion",     deck: "Rocket League-like", rarity: "Black Market", imageUrl: "https://picsum.photos/seed/toon-explosion/400/400", description: "Decal Black Market ultra rare.", xpReward: 250, dropRate: 0.01 },
  { name: "Gold Cap",           deck: "Rocket League-like", rarity: "Limited",      imageUrl: "https://picsum.photos/seed/gold-cap-rl/400/400",    description: "Edition limitee. Introuvable.", xpReward: 300, dropRate: 0.01 },

  // === POP CULTURE ===
  { name: "Minion Jaune",       deck: "Pop Culture", rarity: "Common",       imageUrl: "https://picsum.photos/seed/minion-basic/400/400",   description: "Un minion tout simple. Il dit 'Banana !'.", xpReward: 10, dropRate: 0.5 },
  { name: "Shrek Basique",      deck: "Pop Culture", rarity: "Common",       imageUrl: "https://picsum.photos/seed/shrek-basic/400/400",    description: "L'ogre vert dans toute sa splendeur.", xpReward: 10, dropRate: 0.5 },
  { name: "Baby Yoda",          deck: "Pop Culture", rarity: "Uncommon",     imageUrl: "https://picsum.photos/seed/baby-yoda/400/400",      description: "Grogu dans sa version bebe. Trop mignon.", xpReward: 20, dropRate: 0.22 },
  { name: "Grogu Force",        deck: "Pop Culture", rarity: "Rare",         imageUrl: "https://picsum.photos/seed/grogu-force/400/400",    description: "Grogu utilise la Force. Impressionnant.", xpReward: 40, dropRate: 0.12 },
  { name: "Portal Driver",      deck: "Pop Culture", rarity: "Very Rare",    imageUrl: "https://picsum.photos/seed/portal-driver/400/400",  description: "Pilote venu d'un portail inter-dimensionnel.", xpReward: 70, dropRate: 0.07 },
  { name: "Among Us Red",       deck: "Pop Culture", rarity: "Import",       imageUrl: "https://picsum.photos/seed/amogus-red/400/400",     description: "Le crewmate rouge. Etait-il imposteur ?", xpReward: 110, dropRate: 0.04 },
  { name: "Thanos",             deck: "Pop Culture", rarity: "Exotic",       imageUrl: "https://picsum.photos/seed/thanos-snap/400/400",    description: "La realite est souvent decevante.", xpReward: 160, dropRate: 0.03 },
  { name: "Doge",               deck: "Pop Culture", rarity: "Black Market", imageUrl: "https://picsum.photos/seed/doge-crypto/400/400",    description: "Much rare. Very Black Market. Wow.", xpReward: 250, dropRate: 0.01 },
  { name: "Rick Sanchez Ultime",deck: "Pop Culture", rarity: "Limited",      imageUrl: "https://picsum.photos/seed/rick-ultime/400/400",    description: "Wubba lubba dub dub ! Edition tres limitee.", xpReward: 300, dropRate: 0.01 },

  // === POKEMON ===
  { name: "Rattata",            deck: "Pokemon", rarity: "Common",       imageUrl: "https://picsum.photos/seed/rattata/400/400",         description: "Le Pokemon le plus commun qui soit.", xpReward: 10, dropRate: 0.5 },
  { name: "Magicarpe",         deck: "Pokemon", rarity: "Common",       imageUrl: "https://picsum.photos/seed/magicarpe/400/400",       description: "Inutile au combat, magnifique en collection.", xpReward: 10, dropRate: 0.5 },
  { name: "Bulbizarre",        deck: "Pokemon", rarity: "Uncommon",     imageUrl: "https://picsum.photos/seed/bulbizarre/400/400",      description: "Le starter plante de la premiere generation.", xpReward: 20, dropRate: 0.22 },
  { name: "Dracaufeu Basique", deck: "Pokemon", rarity: "Rare",         imageUrl: "https://picsum.photos/seed/dracaufeu-base/400/400",  description: "Dracaufeu dans sa forme de base.", xpReward: 40, dropRate: 0.12 },
  { name: "Pikachu Surf",      deck: "Pokemon", rarity: "Very Rare",    imageUrl: "https://picsum.photos/seed/pikachu-surf/400/400",    description: "Pikachu en mode plage. Edition speciale.", xpReward: 70, dropRate: 0.07 },
  { name: "Neon Pikachu",      deck: "Pokemon", rarity: "Import",       imageUrl: "https://picsum.photos/seed/neon-pikachu/400/400",    description: "Version neon d'un classique electrique.", xpReward: 110, dropRate: 0.04 },
  { name: "Mewtwo Armure",     deck: "Pokemon", rarity: "Exotic",       imageUrl: "https://picsum.photos/seed/mewtwo-armor/400/400",    description: "Mewtwo avec son armure psychique.", xpReward: 160, dropRate: 0.03 },
  { name: "Dracaufeu Shiny",   deck: "Pokemon", rarity: "Black Market", imageUrl: "https://picsum.photos/seed/charizard-shiny/400/400", description: "Dracaufeu chromatique. Ultra rare.", xpReward: 250, dropRate: 0.01 },
  { name: "Mew",               deck: "Pokemon", rarity: "Limited",      imageUrl: "https://picsum.photos/seed/mew-legendaire/400/400",  description: "Le Pokemon originel. On dit qu'il contient l'ADN de tous.", xpReward: 300, dropRate: 0.01 },
];

async function main() {
  for (const deckName of DECKS) {
    await prisma.deck.upsert({
      where: { name: deckName },
      update: {},
      create: { name: deckName }
    });
  }

  for (const rarityName of RARITIES) {
    await prisma.rarity.upsert({
      where: { name: rarityName },
      update: { weight: rarityWeights[rarityName] },
      create: { name: rarityName, weight: rarityWeights[rarityName] }
    });
  }

  await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      spawnIntervalS: 300,
      captureCooldownS: 5
    }
  });

  const decks = await prisma.deck.findMany();
  const rarities = await prisma.rarity.findMany();
  const deckByName = new Map(decks.map((deck) => [deck.name, deck.id]));
  const rarityByName = new Map(rarities.map((rarity) => [rarity.name, rarity.id]));

  for (const card of sampleCards) {
    const deckId = deckByName.get(card.deck);
    const rarityId = rarityByName.get(card.rarity);
    if (!deckId || !rarityId) {
      continue;
    }

    await prisma.card.upsert({
      where: { name: card.name },
      update: {
        deckId,
        rarityId,
        imageUrl: card.imageUrl,
        description: card.description,
        xpReward: card.xpReward,
        dropRate: card.dropRate
      },
      create: {
        name: card.name,
        deckId,
        rarityId,
        imageUrl: card.imageUrl,
        description: card.description,
        xpReward: card.xpReward,
        dropRate: card.dropRate
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
