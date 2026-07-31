# Inventaire de contenu

Ce document fixe les comptes métier attendus. Le détail contrôlé automatiquement est dans `../audit/CONTENT_INVENTORY.generated.md`.

| Type | Quantité | Contrôle |
|---|---:|---|
| Mondes | 9 | identifiants uniques |
| Zones | 81 | 9 par monde, dont 6 libres et 3 premium |
| Decks | 27 | 3 par monde |
| Cartes | 810 | 30 par deck |
| Compétences | 45 | 15 par branche |
| Quêtes quotidiennes | 90 | modèles uniques |
| Succès | 156 | définitions statiques actuelles |
| Objets | 42 | 30 bases + 12 variantes de récompense |
| Boss | 17 | 9 réguliers + 8 gardiens |
| Saison | 1 | état de contenu actuel |

## Qualité des cartes

Les 27 decks respectent tous la distribution `9/7/5/4/2/2/1`. Les 810 fiches miroir ne divergent pas sur les champs critiques contrôlés. Les images Apex ont un défaut de chemin systématique à corriger dans la source ou via une migration de références.

## Droits

Un asset techniquement présent n’est pas automatiquement publiable. Chaque média exige une provenance, une licence, l’auteur, les restrictions et une preuve durable. Les candidats Envato sans preuve sont exclus de tout build public.

## Publication

Le pipeline de contenu doit :

1. valider schémas et références;
2. produire un diff de version;
3. refuser les identifiants réutilisés ou taux invalides;
4. vérifier la licence des assets;
5. charger dans une zone de staging;
6. publier atomiquement une version;
7. conserver la version précédente pour retour arrière.

## Dettes éditoriales connues

- liens wiki historiques non résolus;
- doublons de notes suffixées `-Maxime`;
- assets NASA anciens non référencés;
- écart de nom de dossier Apex;
- ancien CSV de variantes obsolète.
