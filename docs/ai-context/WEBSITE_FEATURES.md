# Fonctionnalités du site

## RTA Web V2 — branche de développement, non déployée

- Nouvelle navigation principale : Accueil, Jouer, Communauté, Classements et Boutique, avec « Ajouter RTA » séparé et les fonctions personnelles regroupées dans le menu du compte.
- Accueil inspiré de la composition visuelle de Nuron `index-07` : grand hero sombre, statistiques de catalogue, cartes publiées à découvrir, accès rapides et appel vers Discord. Le code reste natif Next.js/React/Tailwind ; aucun composant Vue du template n’est importé.
- Nouvelles pages de cadrage `/play`, `/community` et `/leaderboards`; elles n’ajoutent aucune mécanique au jeu Discord.
- Sur `dev.rocketthemall.com`, toutes les surfaces hors connexion/OAuth/santé sont réservées aux administrateurs RTA, avec page 403, bannière visible et interdiction d’indexation.

## Joueur

- Connexion Discord avec liaison à l’identifiant Discord stable.
- Tableau de bord : progression, quêtes, succès récents et activité.
- Profil : résumé des achievements, points de prestige, pourcentage de complétion et derniers déblocages. Le lien `/achievements` affiche les 144 achievements jouables regroupés par catégorie avec objectifs, progression et dates de déblocage.
- Collection globale : recherche, filtres deck/rareté/catégorie/possession, détail cliquable et affichage de trois decks par page. Chaque deck présente ses 30 cartes de Common à Black Market. La fiche d’une carte propose sous l’image un carrousel accessible permettant de parcourir ses visuels Normal, Shiny et Holo, même avant de posséder ces variantes.
- Réacteur d’Anomalies : sous-menu interne de la Collection (`/collection/reactor`), absent de la navigation principale. Une galerie affiche les images réelles des cartes sacrifiables, triées par nom. Le mode Deck filtre strictement sur le deck choisi, le mode Tier sur la rareté choisie et le mode Vrac conserve toutes les cartes compatibles. Cinq emplacements visibles permettent d’ajouter ou retirer les sacrifices avant confirmation.
- Objets et artefacts : inventaire et effets lisibles; l’équipement Discord utilise exactement deux emplacements d’artefacts, séparés des consommables de préparation. Chaque exemplaire de carte affiche son image Vault correspondant réellement à sa variante normale, shiny ou holo, sur la grille comme sur sa fiche.
- Compétences : arbre de 45 nœuds, prérequis et état d’engagement de branche.
- Échanges : création, inspection, double confirmation, expiration et historique.
- Historique économique : mouvements compréhensibles sans données sensibles.
- Boutique crédits : un marché hebdomadaire affiche six cartes parmi les moins en circulation avec image, deck, tier, prix, circulation figée et prochain reroll. Une offre est achetable une fois par joueur et livre une variante Normal.

## Guilde

- Configuration autonome sur `/setup` pour le propriétaire ou les membres ayant `Gérer le serveur`. La liste est limitée aux guildes actives où Discord confirme ce droit, et la Server Action le revérifie avant de modifier uniquement le salon de jeu.
- Progression communautaire et mondes débloqués.
- État du boss, calendrier, contributions et récompenses.
- Classements bornés et calculés depuis des vues dédiées.
- Affichage uniquement des guildes dont l’utilisateur est membre et autorisé.

## Administration

- Configuration par guilde avec contrôle de rôle côté serveur. Un bouton permet de définir une unique guilde principale en base. Le salon et l’activation du Hall of Fame sont configurables indépendamment pour chaque serveur.
- La page `/setup` est séparée de `/admin` : elle n’expose ni joueurs, ni économie, ni réglages d’une autre guilde, ni options avancées.
- Gestion versionnée du contenu et prévisualisation des imports.
- Supervision des jobs, erreurs, événements et idempotency.
- Ajustements économiques par opérations compensatoires auditées.
- Attribution auditée de crédits/fragments, d’XP et d’objets Vault à un joueur.
- Fiche joueur admin responsive : dons de cartes et d’objets séparés, champs contrastés, quantités explicites et motif obligatoire pour l’objet. Les formulaires s’empilent avant de manquer d’espace et ne débordent plus de leur panneau.
- Configuration indépendante des boss journaliers et des gardiens persistants par serveur, lancement/annulation des boss standards et démarrage manuel d’un gardien prêt.
- Feature flags avec portée et auteur.

## Sécurité de session

L’identité applicative provient du `sub` Discord vérifié, résolu vers l’UUID `User`. Le nom, l’email et l’avatar ne servent jamais de clé d’autorisation. Les actions serveur recalculent les permissions et n’acceptent pas de `userId` arbitraire depuis le navigateur.

## UX et accessibilité

- Navigation clavier, focus visible, libellés explicites et contrastes WCAG AA.
- Pagination côté serveur sur les collections volumineuses.
- États de chargement, vide, erreur et reprise présents.
- Dates affichées avec fuseau indiqué.
- Les actions destructives montrent la portée, nécessitent confirmation et produisent un reçu d’audit.

## Classement Discord des serveurs

Le message central du serveur principal ne liste que les guildes à la fois actives en base et réellement connectées au client Discord. Elles sont classées par `100 × mondes terminés + progression du monde courant`. Le top 3 utilise un podium, chaque serveur affiche son icône Discord, son monde, sa jauge, sa maîtrise et ses boss actifs. Le top 10 est affiché au maximum à cause de la limite Discord de dix embeds.

## Hors navigateur

Le site ne duplique pas le moteur de jeu. Les Server Actions et routes appellent les mêmes services transactionnels que le bot/API.
