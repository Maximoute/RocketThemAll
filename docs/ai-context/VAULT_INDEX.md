# Index du vault

L’index exhaustif lisible par machine est `vault-index.json`. Il est régénéré avec :

```powershell
npm run audit:vault -- "C:\Users\lecom\OneDrive\Developpement\RocketThemAll\Vault-RTA"
```

Le rapport condensé produit par ce script est `VAULT_INDEX.generated.md`. Ne pas modifier manuellement les fichiers `*.generated.md` ou `vault-index.json`.

## Périmètre indexé au 11 août 2026

- 4 812 fichiers, 747 136 090 octets.
- 2 199 notes Markdown.
- 2 531 images PNG.
- 42 fichiers JSON, 21 CSV et 17 scripts Python.
- 810 cartes uniques, présentes dans deux représentations Markdown cohérentes sur leurs champs critiques.
- 3 notes de gouvernance temps réel : état déployé, journal de bord et règle de synchronisation Code ↔ Obsidian.

## Routage

- Vision et boucle de jeu : `00-*`, `01-*` et documents `CORE`.
- Données normalisées et exports : `10-BDD`, `_data`.
- Fiches de cartes et médias : `20-Cards`.
- Gouvernance, suivi et arbitrages : `99-*`.
- Index détaillé des titres, frontmatters, liens et empreintes : `vault-index.json`.

## Contrôles automatiques

Le script vérifie :

- unicité et format des identifiants;
- distribution des raretés par deck;
- cohérence des miroirs de cartes;
- somme des probabilités de variantes;
- liens wiki et références d’assets;
- assets orphelins et duplications exactes.

## Anomalies connues

- 64 liens wiki non résolus, principalement des noms historiques de cartes.
- 90 références d’assets Apex pointent vers `Apex Predators` alors que le dossier réel est `Apex Legends`.
- 42 assets non référencés, surtout d’anciens doublons NASA.
- 7 paires de notes générées exactement identiques.
- `_data/card_variants.csv` contient d’anciens taux `94/5/1`; les taux normatifs retenus sont `98,9/1/0,1`.
- Une partie des visuels est marquée comme candidate Envato; la preuve de licence reste bloquante avant publication.
