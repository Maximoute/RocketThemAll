# Fonctionnalités du site

## Joueur

- Connexion Discord avec liaison à l’identifiant Discord stable.
- Tableau de bord : progression, quêtes, succès récents et activité.
- Profil : résumé des achievements, points de prestige, pourcentage de complétion et derniers déblocages. Le lien `/achievements` affiche les 144 achievements jouables regroupés par catégorie avec objectifs, progression et dates de déblocage.
- Collection globale : recherche, filtres deck/rareté/catégorie/possession, détail cliquable et affichage de trois decks par page. Chaque deck présente ses 30 cartes de Common à Black Market. La fiche d’une carte propose sous l’image un carrousel accessible permettant de parcourir ses visuels Normal, Shiny et Holo, même avant de posséder ces variantes.
- Objets et artefacts : inventaire et effets lisibles; l’équipement Discord utilise exactement deux emplacements d’artefacts, séparés des consommables de préparation. Chaque exemplaire de carte affiche son image Vault correspondant réellement à sa variante normale, shiny ou holo, sur la grille comme sur sa fiche.
- Compétences : arbre de 45 nœuds, prérequis et état d’engagement de branche.
- Échanges : création, inspection, double confirmation, expiration et historique.
- Historique économique : mouvements compréhensibles sans données sensibles.

## Guilde

- Progression communautaire et mondes débloqués.
- État du boss, calendrier, contributions et récompenses.
- Classements bornés et calculés depuis des vues dédiées.
- Affichage uniquement des guildes dont l’utilisateur est membre et autorisé.

## Administration

- Configuration par guilde avec contrôle de rôle côté serveur. Un bouton permet de définir une unique guilde principale en base. Le salon et l’activation du Hall of Fame sont configurables indépendamment pour chaque serveur.
- Gestion versionnée du contenu et prévisualisation des imports.
- Supervision des jobs, erreurs, événements et idempotency.
- Ajustements économiques par opérations compensatoires auditées.
- Attribution auditée de crédits/fragments, d’XP et d’objets Vault à un joueur.
- Configuration des boss par serveur, lancement/annulation des boss standards et démarrage manuel d’un gardien prêt.
- Feature flags avec portée et auteur.

## Sécurité de session

L’identité applicative provient du `sub` Discord vérifié, résolu vers l’UUID `User`. Le nom, l’email et l’avatar ne servent jamais de clé d’autorisation. Les actions serveur recalculent les permissions et n’acceptent pas de `userId` arbitraire depuis le navigateur.

## UX et accessibilité

- Navigation clavier, focus visible, libellés explicites et contrastes WCAG AA.
- Pagination côté serveur sur les collections volumineuses.
- États de chargement, vide, erreur et reprise présents.
- Dates affichées avec fuseau indiqué.
- Les actions destructives montrent la portée, nécessitent confirmation et produisent un reçu d’audit.

## Hors navigateur

Le site ne duplique pas le moteur de jeu. Les Server Actions et routes appellent les mêmes services transactionnels que le bot/API.
