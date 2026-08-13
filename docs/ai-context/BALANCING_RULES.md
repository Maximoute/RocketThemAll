# Règles d’équilibrage

## Invariants publiés

- Chaque deck comporte 30 cartes.
- Distribution par deck : 9 Common, 7 Uncommon, 5 Rare, 4 Very Rare, 2 Import, 2 Exotic, 1 Black Market.
- Variantes : 98,9 % Normal, 1 % Shiny, 0,1 % Holo.
- Une bonne réponse donne exactement 95 % de chance de capture. Une mauvaise réponse part de 25 % puis applique les bonus et pénalités, avec une borne de 5 % à 99,5 %.
- Un encens de tier porte ce tier à 50 % dans la distribution de rencontre et fixe, pour la run concernée, les chances de variante à 5 % Shiny et 1 % Holo.
- Une capture réussie possède environ 10 % de chance de donner un consommable, puis le tier de l’objet est tiré séparément.
- Chaque joueur possède quatre charges d’exploration; une charge se régénère toutes les cinq minutes, une par une. Les administrateurs explicitement marqués comme illimités ne consomment pas de charge.
- Trois quêtes quotidiennes sont attribuées par joueur et par journée `Europe/Paris`.
- Une quête de mondes distincts n’est éligible que si sa cible exacte est inférieure ou égale au nombre de mondes accessibles. Une attribution active incompatible avec ce nombre est remplacée automatiquement sans récompense.
- Un joueur gagne un point de compétence par niveau.
- Exactement deux artefacts au maximum sont équipés; les consommables de préparation utilisent un autre quota.
- Un boss standard apparaît chaque jour à minuit dans le fuseau de la guilde et dure 24 heures. En parallèle, le gardien du monde apparaît dès que la maîtrise atteint 100 %, conserve toute sa progression et reste actif jusqu’à sa défaite.
- Le tier d’un boss régulier est tiré indépendamment du monde : 30 % Common, 25 % Uncommon, 20 % Rare, 13 % Very Rare, 8 % Import et 4 % Exotic.
- Le tier d’un gardien est fixe selon le passage protégé : Common, Uncommon, Rare, Very Rare, Import, puis Exotic pour les trois derniers passages.
- Une entrée de zone premium en crédits vaut le prix de référence du Pass d’expédition + 50 crédits. Le Pass est actuellement non achetable (`0`), donc le coût de base est 50 crédits.
- Le marché hebdomadaire contient 2 Common à 15 000 crédits, 2 Rare à 35 000, 1 Very Rare à 75 000 et 1 Import à 150 000. Il tourne le lundi à 00:00 `Europe/Paris`, favorise la circulation la plus faible et limite chaque offre à un achat par joueur.

## Boss par tier

| Tier | Difficulté | Crédits | XP | Fragments | Cierges | Larmes | Masques | Fleurs max. | Booster Conquérant | Coffre Conquérant |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Common | ×0,75 | 125 | 80 | 1 | 1 | 0 | 0 | 1 | 1 % | 3 % |
| Uncommon | ×0,90 | 180 | 120 | 2 | 2 | 0 | 0 | 1 | 2 % | 5 % |
| Rare | ×1,10 | 260 | 180 | 3 | 3 | 0 | 0 | 2 | 4 % | 8 % |
| Very Rare | ×1,35 | 380 | 260 | 5 | 5 | 1 | 0 | 2 | 6 % | 12 % |
| Import | ×1,65 | 550 | 380 | 8 | 7 | 1 | 1 | 3 | 8 % | 16 % |
| Exotic | ×2,00 | 800 | 550 | 12 | 10 | 2 | 1 | 3 | 10 % | 20 % |

Les crédits, l’XP et les fragments sont garantis à chaque participant éligible. Un gardien applique un bonus de 25 % aux crédits/XP et arrondit les fragments au supérieur. Le booster et le coffre sont des jets indépendants et leur objet reprend exactement le tier de l’apparition. Les Cierges, Larmes et Masques ne sont exigés que par une mécanique `OFFERING`; la limite de Fleurs s’applique à tous les boss chronométrés.

## Paramètres de progression proposés

Les niveaux minimaux des neuf mondes sont provisoirement `0, 5, 10, 15, 20, 30, 40, 50, 75`. Ils ne sont pas considérés comme publiés tant qu’une simulation de courbe d’XP et une session de validation produit n’ont pas eu lieu.

## Gardiens

Seuil cible :

```text
baseTargetByWorld × clamp(0,75 + sqrt(activePlayers) / 5, 0,75, 2,50)
```

Bases proposées pour les huit gardiens : `250, 450, 700, 1000, 1350, 1750, 2200, 2700`. Un déblocage doit prendre au minimum sept jours. Ces valeurs exigent simulation sur cohortes avant activation.

## Méthode

1. Énoncer l’objectif de durée et de distribution.
2. Simuler plusieurs cohortes et niveaux d’activité.
3. Vérifier percentiles, inflation et cas extrêmes.
4. Publier la version de configuration.
5. Mesurer en production avec garde-fous.
6. Modifier seulement par une nouvelle version et conserver l’historique.

## Garde-fous

- Pas de modification silencieuse des probabilités après acquisition.
- Pas de formule arbitraire exécutée depuis un JSON de contenu.
- Les tables Limited sont explicites par événement.
- Les bonus cumulés sont plafonnés par le moteur, pas seulement par l’interface.
- Les récompenses ne dépendent pas d’une horloge locale non normalisée.

## Questions d’équilibrage ouvertes

Le coût de réinitialisation des compétences, le devenir des points après le niveau 45, la courbe complète d’XP et le chaudron restent à valider. Ils sont répertoriés dans `OPEN_QUESTIONS.md`.
