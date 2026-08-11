# Index des systèmes de jeu

| Système | Règle normative | État implémenté |
|---|---|---|
| Exploration | Hub persistant par guilde, zones selon progression et danger | Hub `/explore`, propositions 2 gratuites + 1 premium et entrée à `prix Pass + 50` crédits |
| Rencontre | Publique, une tentative indépendante par joueur | `Encounter` et `CaptureAttempt` transactionnels |
| Capture | 95 % si la réponse est correcte; base 25 % si elle est incorrecte, puis modificateurs bornés | Calcul centralisé avec fenêtre de tension de 3 secondes et objets |
| Variantes | Normal 98,9 %, Shiny 1 %, Holo 0,1 % | Taux centralisés et configurables |
| Collection | Globale, un exemplaire protégé, doublons consommables | Collection Vault globale et fiches détaillées |
| Économie | Crédits globaux, ledger immuable, mutation atomique | Ledger et idempotence actifs |
| Fusion | Coût par rareté : 3/5/7/9/12/18 | Service transactionnel |
| Objets | 42 définitions, exactement 2 emplacements d’artefacts et des emplacements de consommables séparés | 42 définitions, effets runtime, inventaire et équipement interactif |
| Boosters | 1 carte du tier; variantes de boss : 3 tirées, 1 gardée | Carte issue de tous les decks Vault |
| Progression joueur | Niveaux, XP, 1 point de compétence par niveau | XP, niveaux et points persistés |
| Compétences | 45 nœuds, trois branches de 15 | Arbre complet importé |
| Progression guilde | Maîtrise, déblocages et gardiens | Progression par monde et guilde |
| Quêtes | 3/jour, déterministes, expiration à minuit Europe/Paris, 90 modèles | objectifs contextuels bornés par les mondes réellement accessibles, remplacement automatique des quêtes actives impossibles et récompenses automatiques |
| Succès | 144 achievements permanents + 12 modèles générateurs | 156 définitions en BDD, progression durable, rattrapage historique et profils Discord/web |
| Boss | 9 réguliers + 8 gardiens de progression | six tiers possibles dans chaque monde régulier, gardiens à tier fixe, difficulté/offrandes/fragments et récompenses Conquérant proportionnels |
| Contrats | Recherche et don de doublons via la spécialisation Courtier | séquestre, expiration, transfert protégé et réseau intelligent privés |
| Commerce | Échanges globaux sécurisés, confirmation atomique | Confirmation atomique et expiration |

## Capture V2

Chaque rencontre crée une fenêtre publique. Chaque joueur humain éligible peut soumettre au plus une tentative. Le résultat principal est calculé une seule fois par rencontre et par joueur.

Probabilité :

```text
si réponse correcte : chance = 95
sinon :
  base = 25
  bonus préparation = +7 si complet, +3 si partiel, sinon 0
  bonus progression = 0..3
  pénalité de cible = 0..20
  chance = clamp(base + bonus préparation + bonus progression - pénalité, 5, 99,5)
```

La réussite de capture et le tirage de variante sont deux décisions indépendantes. Le moteur doit accepter une source aléatoire injectée afin que les tests et les reprises soient déterministes.

## Danger et raretés

| Danger | Distribution |
|---|---|
| Calm | 65 % Common, 25 % Uncommon, 10 % Rare |
| Unstable | 30 % Common, 40 % Uncommon, 25 % Rare, 5 % Very Rare |
| Dangerous | 20 % Uncommon, 45 % Rare, 30 % Very Rare, 5 % Import |
| Critical | 20 % Rare, 45 % Very Rare, 30 % Import, 5 % Exotic |
| Extreme | 20 % Very Rare, 45 % Import, 30 % Exotic, 5 % Black Market |
| Limited | Distribution fournie explicitement par l’événement |

## Progression communautaire

Une exploration réussie dans le monde frontière donne un point de maîtrise. Les états sont `LOCKED`, `PROGRESSING`, `BOSS_READY`, `BOSS_ACTIVE`, `BOSS_DEFEATED`. Le gardien est planifié au prochain créneau hebdomadaire après franchissement du seuil. Un échec conserve la maîtrise et les contributions déjà consommées.

## Événements métier

Les mutations émettent des événements versionnés (`capture.succeeded`, `credits.changed`, `booster.opened`, `boss.damage_dealt`, etc.). Quêtes, succès, analytics et notifications les consomment sans dupliquer la logique métier. Le worker réévalue les compteurs d’achievements concernés depuis les données durables et `UserAchievement` conserve le maximum atteint ainsi que la date de déblocage.
