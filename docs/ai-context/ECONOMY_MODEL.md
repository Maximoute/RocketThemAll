# Modèle économique

## Principes

- Les crédits et actifs personnels sont globaux au joueur.
- Tout changement est enregistré dans un ledger immuable avec solde avant/après.
- Une transaction externe rejouée retourne le premier résultat au lieu de payer deux fois.
- Aucun solde ou stock ne peut devenir négatif.
- Les paramètres économiques sont versionnés et simulés avant publication.

## Doublons

Un exemplaire de collection est protégé. Seuls les exemplaires excédentaires sont vendables ou consommables, sauf action explicite autorisée par une règle future.

Coût de fusion par rareté :

| Rareté source | Exemplaires requis |
|---|---:|
| Common | 3 |
| Uncommon | 5 |
| Rare | 7 |
| Very Rare | 9 |
| Import | 12 |
| Exotic | 18 |

Les valeurs de variantes pour les recettes pondérées sont Normal 1, Shiny 4 et Holo 10.

## Boosters

Un booster standard produit exactement une carte de la rareté liée à son tier,
tirée dans l’ensemble des decks publiés. Un booster de conquérant tire trois
cartes et permet d’en conserver une. Le booster est consommé et la carte est
octroyée dans la même transaction.

## Boss et zones premium

Le tier est fixé dans le snapshot de chaque apparition de boss. Les crédits, l’XP et les fragments garantis augmentent avec ce tier; le booster et le coffre du Conquérant utilisent le même tier lorsqu’un jet indépendant réussit. Les gardiens reçoivent un bonus de récompense de 25 %.

Une zone premium accepte soit un Pass d’expédition, soit un paiement égal à la valeur de référence du Pass + 50 crédits. Comme le Pass est actuellement `drop uniquement`, sa valeur de référence vaut zéro et l’entrée coûte 50 crédits avant un éventuel multiplicateur temporaire d’Envahisseur.

## Chaudron

Les recettes sont propres à un deck, versionnées et bornées. La sélection des ingrédients est verrouillée avant calcul. L’échec ou le succès consomme et récompense de façon atomique. L’interface affiche les chances sans révéler une graine exploitable.

## Échanges

Un échange possède une version, une expiration et des confirmations séparées. L’exécution réclame atomiquement le statut `READY`; un seul processus peut transférer les actifs. Toute modification de l’offre invalide les confirmations précédentes.

## Administration

Une correction utilise une écriture compensatoire, jamais l’édition d’une entrée de ledger. Chaque opération précise acteur, raison, ticket, périmètre, avant/après et clé d’idempotence.

## Indicateurs

- crédits créés/détruits par cause;
- concentration des soldes;
- taux de vente, fusion et échange;
- valeur de doublons par rareté;
- ouvertures et rendement de boosters;
- échecs de transactions et conflits concurrents.
