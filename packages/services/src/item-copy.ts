type ItemCopyInput = {
  contentKey: string;
  effectKey?: string | null;
  type?: string;
};

const EFFECT_DESCRIPTIONS: Record<string, string> = {
  EXP_ROUTE_ANALYSIS:
    "Analyse une route proposée et révèle ses bandes de rareté. L’artefact doit être équipé.",
  CAPTURE_TIER_PITY_90:
    "Protège les longues séries de malchance sur un même tier. L’artefact doit être équipé.",
  EXP_ARCHIVE_RESONANCE:
    "Renforce le poids des decks ou tiers représentés dans tes Archives. L’artefact doit être équipé.",
  CONSUMABLE_EXTEND_WHITELISTED:
    "Ajoute 1 utilisation aux encens compatibles, une fois par jour, lorsque le Sablier est équipé.",
  EXP_DUPLICATE_REROLL:
    "Permet de relancer un doublon selon les règles du Collectionneur. L’artefact doit être équipé.",
  EXP_FREE_PAID_ZONE_ENTRY:
    "Remplace le paiement en crédits d’une entrée dans une route premium.",
  EXP_DECK_WEIGHT_BOOST:
    "Double le poids du deck choisi pendant 3 explorations. Shiny 5 % et Holo 1 % pendant l’effet.",
  EXP_TIER_WEIGHT_BOOST:
    "Donne 95 % de chance de tirer le tier indiqué pendant 3 explorations, même hors du profil de danger. Shiny 5 % et Holo 1 %.",
  EXP_REPLACE_ONE_ROUTE:
    "Remplace une des routes proposées sans consommer une charge d’exploration.",
  EXP_REVEAL_EXACT_DISTRIBUTION:
    "Révèle les informations exactes disponibles pendant une tentative de capture.",
  CAPTURE_CHANCE_PLUS_POINTS:
    "Ajoute 15 points à la chance de capture de la prochaine tentative, selon son plafond.",
  CAPTURE_SECOND_ATTEMPT:
    "Relance automatiquement une fois le jet de capture après un premier échec.",
  ITEM_DROP_ROLL_TWICE:
    "Lance deux fois le tirage du prochain objet de capture et conserve le meilleur résultat.",
  BOSS_SERVER_PROGRESS_BOOST:
    "Augmente de 20 % la progression communautaire d’un boss pendant sa durée d’effet.",
  BOSS_OFFERING_COMMON_THRESHOLD:
    "Offrande consommée par les boss qui demandent des cierges. La quantité requise dépend du tier du boss.",
  BOSS_OFFERING_REVEAL_PHASE:
    "Offrande rare consommée par certains boss pour satisfaire ou révéler une phase d’objectif.",
  BOSS_OFFERING_SOURCE_SPECIFIC:
    "Offrande obtenue sur une source précise et consommée par les boss qui la réclament.",
  BOSS_TIMER_EXTENSION:
    "Fleur extrêmement rare utilisée par les contrats de boss compatibles avec une prolongation.",
  BOSS_CHOICE_BOOSTER:
    "Booster de conquérant : propose plusieurs cartes du tier indiqué et permet d’en conserver une partie.",
  BOSS_REWARD_CHEST:
    "Coffre de conquérant contenant une récompense proportionnelle au tier indiqué."
};

const CONTENT_DESCRIPTIONS: Record<string, string> = {
  "booster.basic": "Donne une carte aléatoire Common issue de n’importe quel deck publié.",
  "booster.rare": "Donne une carte aléatoire Rare issue de n’importe quel deck publié.",
  "booster.epic": "Donne une carte aléatoire Very Rare issue de n’importe quel deck publié.",
  "booster.legendary": "Donne une carte aléatoire Black Market issue de n’importe quel deck publié."
};

export function itemTechnicalDescription(item: ItemCopyInput) {
  return CONTENT_DESCRIPTIONS[item.contentKey]
    ?? (item.effectKey ? EFFECT_DESCRIPTIONS[item.effectKey] : undefined)
    ?? (item.type === "SOUVENIR"
      ? "Objet commémoratif de collection, sans activation de gameplay."
      : "Objet de collection RTA. Aucun effet technique actif n’est configuré.");
}

