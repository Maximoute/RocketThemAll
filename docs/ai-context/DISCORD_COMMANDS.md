# Contrat des commandes Discord

## Surface joueur

| Commande | Réponse | Règles |
|---|---|---|
| `/explore` | Hub public persistant + confirmation éphémère | Crée ou rafraîchit l’unique hub de la guilde |
| `/collection` | Éphémère | Collection globale, filtres et pagination |
| `/profile` | Éphémère | Progression globale, résumé des achievements et équipement interactif |
| `/quests` | Éphémère | Trois quêtes du jour, progression et expiration UTC |
| `/achievements` | Éphémère | Catalogue paginé, filtres par catégorie, points et progression personnelle |
| `/skills` | Éphémère | Arbre, points et équipement |
| `/items` | Éphémère | Inventaire et état des artefacts |
| `/shop` | Éphémère | Boutique, solde de crédits personnel et achat optionnel |
| `/cardinfo` | Réponse de commande | Fiche d’une carte Vault par nom ou identifiant, possession par variante et image jointe |
| `/trade` | Éphémère jusqu’à confirmation | Échange global, confirmation explicite des deux parties |
| `/boss` | Éphémère | État, mécanique, progression et contribution au boss de la guilde |

Les commandes économiques historiques encore conservées sont `/sell`, `/recycle`, `/fragment`, `/value`, `/fusion`, `/daily`, `/shop`, `/boosters`, `/craft`, `/cardinfo`, `/leaderboard` et `/booster`. `/shop` est toujours privé et affiche le solde de crédits actualisé, y compris après un achat. `/cardinfo` interroge uniquement le catalogue Vault publié, accepte un identifiant non ambigu ou un nom complété par le deck, puis joint l’image normale, shiny ou holo demandée. Les commandes `/spawn`, `/capture` et `/inventory` ne sont plus enregistrées. Aucun spawn automatique de carte normale n’est autorisé; seuls les boss peuvent être déclenchés automatiquement via leur cycle et leurs conditions dédiés.

## Surface administration

- Configuration du salon unique et des rôles autorisés.
- Activation contrôlée de fonctionnalités.
- Prévisualisation obligatoire avant toute opération de contenu.
- Annulation logique plutôt que suppression physique.
- Consultation des audits, jobs et erreurs sans exposer de secrets.

## Interactions

Les `custom_id` sont signés, versionnés, compacts et contiennent une expiration ainsi que le contexte minimal. Le serveur revalide systématiquement l’utilisateur, la guilde, l’état de l’agrégat et l’expiration; l’interface Discord ne constitue jamais une autorisation.

Les boutons Profil, Collection, Quêtes, Boss, Inventaire, Contrats et Compétences du hub ouvrent directement leur vue éphémère. Le profil propose aussi les boutons Inventaire, Arbre de compétences, Contrats et Achievements. Le profil et l’inventaire exposent exactement deux emplacements d’artefacts; les consommables de préparation utilisent des emplacements séparés. Un artefact doit être possédé puis équipé pour rendre son effet disponible.

## Boss

Un boss accepte une mécanique active : offrandes destructives, harmonisation/collection non destructive, chasse par captures ou créatures d’expédition. Une offrande peut demander simultanément crédits, fragments, doublons du monde et objets rituels; chaque sacrifice affiche un récapitulatif privé puis exige une confirmation. Le nombre de Cierges, Larmes, Masques et Fleurs est déterminé par le tier affiché de l’apparition; la Larme révèle la phase, le Masque affiche et vérifie sa source, la Fleur prolonge le job d’expiration et la Bannière amplifie les actions non rituelles. Pour une demande de collection, la fiche indique le nombre exact, le périmètre de mondes, les règles de variante et la situation personnelle du joueur. Pendant un boss à sbires, seules les captures marquées comptent. Une catégorie et un tier régulier sont choisis de façon déterministe, indépendamment du monde; un Envahisseur applique un modificateur visible à son monde et celui-ci disparaît automatiquement à la fin. Seuls les joueurs ayant contribué reçoivent crédits, XP et fragments, puis deux jets Conquérant indépendants dont les objets reprennent le tier affiché. Un gardien vaincu déverrouille le monde suivant; un gardien expiré revient à l’état prêt avec reprise des contributions destructives.

## Hub

Un hub est identifié en base par guilde, salon et message. S’il est supprimé, la prochaine commande le recrée. Une clé active unique et une réconciliation du message concurrent garantissent un seul hub autoritatif. Le rendu reste exploitable après redémarrage du bot.

## Rencontre

Après le choix du monde, l’interface tire exactement trois routes sous forme de boutons : deux zones gratuites et une zone premium. Chaque bouton affiche `Zone (Deck)` car une zone publiée détermine directement son unique deck; aucun second choix de deck n’est demandé. Un quatrième bouton ouvre les objets d’exploration, dont le Prisme de bifurcation qui remplace une seule route.

Le menu de route contient uniquement les objets de zone. Le menu de rencontre contient uniquement les objets de capture, dont l’Élixir de lucidité et le Catalyseur de précision; les deux listes sont disjointes. Le message public décrit la cible et l’échéance, mais ne révèle aucun indice gratuit. Avant la résolution, la carte conserve son image normale puisque la variante n’est tirée qu’au moment de la capture. Les réponses d’un joueur sont privées quand elles révèlent un choix. Après validation, un compte à rebours visible de trois secondes précède le résultat, qui affiche l’image Vault exacte de la variante obtenue (`normal`, `shiny` ou `holo`). Après clôture, le message est rendu inactif. Les interactions tardives reçoivent une explication éphémère et ne produisent aucune mutation.

Une capture Shiny ou Holo réussie produit une annonce illustrée lorsque le Hall of Fame est activé sur le serveur d’origine et qu’un salon y est configuré. La tentative de capture est la clé d’idempotence de l’annonce. Une variante normale, un Hall of Fame désactivé ou un salon absent ne produit aucun message public supplémentaire. Le statut de serveur principal est géré séparément dans le panneau d’administration.

## Limites

Les cooldowns et quotas sont persistants et partagés entre instances. Ils s’appliquent par action avec des clés explicites (`guild`, `user`, `command`) et ne reposent pas sur une `Map` mémoire.
