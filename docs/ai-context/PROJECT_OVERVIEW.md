# Rocket Them All — vue d’ensemble

## Mission

Rocket Them All (RTA) est un jeu de collection et de progression hybride Discord/Web. Discord porte la boucle de jeu communautaire en temps réel; le site porte la consultation, la gestion de collection, le commerce et l’administration. Le produit cible plusieurs serveurs Discord avec une identité joueur globale et un contexte communautaire propre à chaque serveur.

## Sources d’autorité

1. Le prompt maître fourni le 27 juillet 2026 définit le niveau de qualité attendu et les livrables.
2. Les notes les plus récentes du vault `Vault-RTA`, en particulier les documents `CORE ... V2/V3`, font autorité sur les notes historiques contradictoires.
3. Le schéma Prisma, les migrations et le code indiquent uniquement l’état implémenté; ils ne remplacent pas la conception.
4. Les décisions d’arbitrage sont consignées dans `CONFLICTS_AND_DECISIONS.md`.

## Modèle produit retenu

- Global au joueur : identité, collection, variantes, objets, crédits, progression personnelle, quêtes, succès et compétences.
- Local à la guilde : configuration, salon de jeu, progression communautaire, boss, déblocages et paramètres d’événements.
- Une commande `/explore` ouvre ou rafraîchit un hub persistant dans un unique salon de jeu.
- Une rencontre publique accepte une tentative indépendante par joueur éligible; il n’existe pas de gagnant unique.
- Les actions personnelles sont éphémères quand elles contiennent des informations privées ou de la navigation.
- L’économie, les récompenses et les ouvertures sont atomiques, idempotentes et traçables.

## Inventaire actuel

- Monorepo npm : `apps/api`, `apps/bot`, `apps/web`, `apps/worker`, `packages/auth`, `packages/database`, `packages/game-engine`, `packages/services`, `packages/shared`.
- Stockage : PostgreSQL via Prisma; MinIO/S3 pour les médias.
- Contenu du vault : 9 mondes, 81 zones, 27 decks, 810 cartes, 45 compétences, 90 quêtes quotidiennes, 156 succès, 42 objets et 17 boss.
- Le catalogue Vault est l’unique source de cartes publiée. Les médias canoniques utilisent exclusivement les préfixes `vault/cards`, `vault/items` et `vault/bosses`.
- Le code couvre le hub `/explore`, les rencontres multi-joueurs, la collection, les objets, les boosters, les compétences, les quêtes, les succès, les boss, le commerce et l’administration.

## Garanties actuelles

- Les rencontres de cartes normales sont déclenchées uniquement par une action utilisateur dans `/explore`; seuls les boss suivent un cycle planifié.
- Le schéma porte les mondes, zones, rencontres multi-joueurs, compétences, quêtes, succès, objets, boss, tâches planifiées et boîte d’envoi.
- Les mutations économiques critiques utilisent transactions, verrous, ledger et clés d’idempotence.
- L’identité applicative repose sur l’UUID interne et le Discord ID unique.
- La stack Docker de production utilise des conteneurs non-root en lecture seule derrière Nginx.
- Les assets candidats Envato ne peuvent pas être publiés sans preuve de licence.

## Définition de terminé

Une fonctionnalité n’est terminée que si son contrat métier est documenté, sa mutation est atomique et idempotente, ses contrôles d’autorisation sont côté serveur, ses cas limites sont testés, sa télémétrie est exploitable et son déploiement/retour arrière est décrit.
