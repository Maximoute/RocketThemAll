# Plan d’implémentation

## Phase 0 — Protection et connaissance

- Préserver l’arbre de travail utilisateur.
- Indexer le vault intégralement.
- Documenter décisions, risques et traçabilité.
- Rétablir un lockfile et des commandes de validation reproductibles.

Critère de sortie : installation propre et audit de contenu reproductible.

## Phase 1 — Fondations déterministes

- Extraire le moteur pur : tirages pondérés, capture, variantes, danger, progression.
- Unifier versions Prisma/TypeScript.
- Ajouter validation de configuration et tests de propriétés.
- Introduire identifiants/corrélation et erreurs typées.

Critère de sortie : moteur sans I/O testé et utilisé par les services nouveaux.

## Phase 2 — Données et fiabilité

- Étendre le schéma de manière additive.
- Ajouter idempotency, ledger, outbox, jobs et contraintes.
- Créer worker et ordonnanceur à bail.
- Écrire migrations, seeds de contenu et tests Postgres réels.

Critère de sortie : tests de concurrence et de reprise verts.

## Phase 3 — Tranche verticale exploration

- Hub Discord persistant.
- Sélection monde/zone et rencontre publique.
- Tentative multi-capture, récompense atomique et expiration worker.
- Affichage site de la collection et de l’historique.

Critère de sortie : parcours complet validé sur deux guildes et plusieurs instances.

## Phase 4 — Progression et économie

- XP/niveaux, compétences et artefacts.
- Quêtes/succès par événements.
- Vente, fusion, chaudron, boosters et échanges durcis.
- Archives, contrats de collection et spécialisations complètes.
- Simulations d’équilibrage.

## Phase 5 — Communauté

- Progression guilde, boss réguliers et gardiens.
- Boss standards quotidiens, gardiens sur créneau configurable, contributions multi-ressources, invasions et récompenses Conquérant.
- Administration et feature flags.

## Phase 6 — Production

- Docker multi-stage non-root, CI/CD, secrets et scans.
- SLO, dashboards, alertes et runbooks.
- Sauvegarde/restauration testée, charge, canary et rollback.
- Revue licences, accessibilité, RGPD et go/no-go.

## Ordre de sécurité

Les défauts SSRF, IDOR, double dépense et double exécution d’échange sont corrigés avant toute exposition publique, même si leur fonctionnalité apparaît dans une phase ultérieure.
