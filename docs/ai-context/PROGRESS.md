# Progression

Dernière mise à jour : 5 septembre 2026.

## Terminé

- Lecture du prompt maître.
- Inventaire complet du dépôt et du vault.
- Récupération sûre de l’historique Git distant.
- Création du worktree isolé `RocketThemAll-codex` sur `codex/rta-complete`.
- Lecture des documents normatifs gameplay, capture, compétences, objets, quêtes, succès, boss, économie, UX et administration.
- Audit automatique des 4 809 fichiers du vault.
- Validation des comptes de contenu et distributions de rareté.
- Identification des conflits de variantes, assets, liens et doublons.
- Audit initial de sécurité, concurrence, architecture et tests.
- Création des 19 documents de contexte demandés.
- Rétablissement de l’installation npm reproductible et alignement Prisma 5.22.
- Mise à niveau des dépendances vulnérables; `npm audit` à zéro vulnérabilité connue.
- Moteur de jeu déterministe : capture, variantes 98,9/1/0,1, progression, contenu et quêtes quotidiennes.
- Schéma Prisma V2 additif et migration SQL des guildes, progressions, rencontres, ledger, idempotence, outbox, jobs, objets, compétences, quêtes, succès et boss.
- Correction de l’identité web : UUID interne distinct du Discord ID et relecture des droits admin.
- Pipeline d’images distant anti-SSRF : HTTPS, résolution contrôlée, blocage réseau privé, redirections, taille et signature MIME.
- API durcie : erreurs async, corrélation, logs JSON, proxy borné, limitation de débit et endpoints live/ready.
- Achats/ouvertures/craft de boosters, ventes, recyclages, fusions et exécution d’échanges rendus transactionnels et idempotents sur les chemins Discord.
- Capture Discord historique sérialisée par salon, idempotente par interaction et protégée par un cooldown PostgreSQL persistant; attribution de carte, XP, progression, ledger et outbox dans une même transaction.
- Worker persistant avec lease, `SKIP LOCKED`, retry/backoff, récupération après crash et outbox.
- Exports runtime des workspaces corrigés; build Node et Next standalone vérifié.
- Dockerfile multi-stage non-root, Compose de production, migration one-shot, health checks et Nginx ajoutés.
- Import canonique opérationnel : 9 mondes, 81 zones, 81 associations zone/deck, 27 decks et 810 cartes Vault publiées en base.
- Les 810 images normales, 810 images shiny et 810 images holo des cartes, ainsi que les 42 images d’objets, sont stockées dans MinIO sous des clés stables, référencées en base et servies par `/media`.
- Les 42 définitions d’objets Vault sont publiées avec leurs types, limites de pile, clés d’effet et métadonnées média.
- Les 90 modèles de quêtes quotidiennes, 156 succès et 17 boss Vault sont publiés avec leurs règles, récompenses, métadonnées et relations aux mondes.
- Les 17 images de boss sont stockées dans MinIO; le catalogue média contient désormais 2 489 ressources Vault.
- `/quests` génère idempotemment trois quêtes personnelles par jour à 00:00 `Europe/Paris` et `/achievements` expose le catalogue ainsi que la progression du joueur.
- Première tranche Discord exploration livrée : `/explore`, hub persistant, sélection privée du monde puis des routes proposées, rencontre publique multi-capture et résultat privé.
- Sélection de route alignée sur le produit : deux zones gratuites et une premium en boutons, deck affiché dans le libellé, aucun écran de sélection de deck et bouton Objets avec reroll par Prisme.
- Les rencontres n’affichent plus de `Capture hint` gratuitement; un Élixir de lucidité consommé depuis le bouton Objets révèle l’indice uniquement au joueur concerné.
- Les médias MinIO sont joints à Discord pour rester visibles même depuis une instance locale.
- Ancien moteur de spawn de cartes supprimé du bot; les appels automatiques et manuels sont refusés par le service, les valeurs par défaut sont désactivées et PostgreSQL interdit toute nouvelle ligne d’auto-spawn. Les boss utilisent leur propre cycle `BossRun` et ne sont pas concernés.
- `/spawn`, `/capture` et `/inventory` sont retirés du registre au profit de `/explore` et `/collection`.
- Nouvelles surfaces Discord enregistrées : `/collection`, `/quests`, `/skills`, `/items` et `/boss`; le profil utilise désormais la progression V2.
- Les boutons Profil, Collection, Quêtes et Boss du hub ouvrent leur vraie vue; le profil permet d’équiper les artefacts dans exactement deux slots persistants. Les consommables de préparation utilisent leurs propres emplacements.
- Le profil et le hub `/explore` donnent accès directement à l’arbre de compétences et à l’inventaire; le menu d’inventaire permet d’équiper ou retirer les artefacts possédés.
- Le moteur des 9 boss standards et des 8 gardiens est branché : boss standard quotidien de 24 heures et gardien du monde persistant actifs en parallèle, cinq mécaniques, catégories déterministes, effet d’invasion temporaire, contributions atomiques multi-boss par crédits/fragments/doublons/cartes présentées/captures et déblocage du monde suivant.
- `/boss` affiche l’image, la mécanique, la progression, les récompenses et la contribution personnelle; les offrandes et présentations de collection utilisent des boutons privés signés, tandis que les captures alimentent automatiquement les mécaniques de chasse.
- Le panneau admin permet de configurer les créneaux de gardien par serveur, lancer/annuler un boss standard, démarrer un gardien prêt, ajuster les soldes par delta audité, donner de l’XP et attribuer un objet Vault.
- Les boss à offrandes affichent leurs besoins exacts et exigent une confirmation avant de détruire crédits, fragments, doublons ou objets. Les contributions destructives d’un gardien persistent entre ses tentatives.
- Les Cierges, Larmes, Masques brisés, Fleurs du Néant et Bannières ont un effet transactionnel. Le Masque brisé respecte une source de monde visible et son taux Vault de 0,5 %; les Fleurs prolongent réellement le job d’expiration.
- Les Boosters du Conquérant proposent trois cartes et n’en consomment une qu’après choix confirmé. Les Coffres du Conquérant donnent un consommable autorisé, des crédits et de l’XP dans une transaction unique.
- Chaque boss régulier tire désormais l’un des six tiers indépendamment de son monde; les gardiens utilisent un tier fixe croissant jusqu’à Anomalie Zéro. Le snapshot du run pilote difficulté, exigences rituelles, limite de Fleurs, crédits, XP, fragments et tier des récompenses Conquérant.
- Les zones premium coûtent désormais automatiquement 50 crédits de plus que la valeur de référence du Pass d’expédition, soit 50 crédits avec le Pass actuellement non achetable.
- Les 45 effets de compétences publiés sont reliés au runtime : spécialisations Explorateur, Chasseur, Collectionneur, Archives et Courtier comprises.
- Les contrats de collection de guilde sont opérationnels : prime sous séquestre, don de doublon protégé, expiration/remboursement, réseau intelligent privé et limites de spécialisation.
- Les quêtes quotidiennes accordent automatiquement leurs récompenses, les 144 achievements jouables progressent depuis les données persistantes et les 12 lignes restantes servent de modèles générateurs.
- Les objets de zone et de capture sont séparés, le Scanner spectral exige d’être équipé et la résolution de capture affiche un compte à rebours de trois secondes.
- Le résultat Discord d’une capture réussie affiche l’image exacte de la variante obtenue (`normal`, `shiny` ou `holo`); l’inventaire web utilise la même variante sur la grille et la fiche de l’exemplaire.
- `/shop` répond désormais en privé avec le solde de crédits actualisé; `/cardinfo` résout les cartes du catalogue Vault, gère les noms partagés entre decks, affiche la possession par variante et joint l’image correspondante depuis MinIO.
- La collection web est structurée par decks, trois decks par page, avec les 30 cartes triées par rareté et un filtre possédées/non possédées.
- La fiche web d’une carte permet de parcourir les images Normal, Shiny et Holo avec des flèches et des indicateurs accessibles sous le visuel.
- Rocket Them All (`1505371908621729954`) est initialisé comme serveur principal. Ce statut peut être déplacé par bouton dans le panneau Serveurs. Le salon et l’activation du Hall of Fame sont indépendants pour chaque guilde; les annonces Shiny/Holo utilisent leur véritable image et les retries sont dédupliqués par tentative.
- Synchronisation V2 des 9 guildes Discord, de leur progression et des 81 états monde/guilde; worker d’expiration démarré.
- CI, Dependabot et validation automatique des 19 documents et de l’index du vault ajoutés.
- Validation complète : 92 tests verts dont 65 scénarios services/PostgreSQL, lint de tous les workspaces, schéma et 40 migrations Prisma à jour, build des quatre applications et des packages, 20 routes Next compilées, contexte documentaire validé et `npm audit` à zéro vulnérabilité connue.
- Import réel exact confirmé après les tests : 810 cartes, 42 objets, 90 quêtes, 156 achievements, 17 boss et 45 compétences; aucun utilisateur de test résiduel.
- Économie étendue : vente d’objets spéciaux, Réacteur Deck/Tier/Vrac à cinq sacrifices, catalyse de 100 fragments vers une carte du tier supérieur, craft d’un booster du même tier pour 50 fragments et rendements de recyclage Normal 3–5, Shiny 50–100, Holo 400–700.
- Réacteur web déplacé dans un sous-menu de la Collection. La sélection utilise les images exactes des cartes, un tri alphabétique, cinq emplacements retirables et des filtres stricts par deck ou tier.
- Profil admin joueur rendu responsive avec panneaux séparés pour le don de cartes et d’objets, libellés visibles et contrôles sans débordement.
- Classement central Discord limité aux serveurs réellement connectés au bot, classé par monde puis progression, avec score, podium, jauge et icône de guilde.
- Supervision de production enrichie : état des serveurs, alertes de victoire de boss, avatars Discord web et notifications privées de quête/achievement/niveau après capture.
- Déploiement VPS durci contre la saturation disque : nettoyage des images et caches inutilisés sans suppression des volumes, seuil minimal de 2 Gio, sauvegarde avant migration et health checks publics. Version `1aa68b1` confirmée healthy pour bot, web et API.
- Politique obligatoire code ↔ Obsidian ajoutée dans `AGENTS.md`, le Vault et `DOCUMENTATION_WORKFLOW.md`; chaque fonctionnalité doit désormais synchroniser théorie, état courant et journal dans le même travail.
- Quêtes multi-mondes corrigées : l’éligibilité compare la cible exacte de difficulté au nombre de mondes accessibles et la réconciliation remplace les quêtes actives impossibles, y compris celles ayant déjà commencé.
- Marché hebdomadaire de cartes ajouté au web et à `/shop` : six cartes Normal parmi les moins en circulation, prix élevés par tier, rotation du lundi en heure Paris/Belgique, achat personnel unique et transaction complète avec ledger/outbox.
- Configuration déléguée du salon de jeu ajoutée : `/setup salon:#salon` et page web `/setup`, contrôle Discord propriétaire/`Gérer le serveur` réévalué à chaque mutation, validation des permissions du bot et modification auditée du seul `gameChannelId` de la guilde courante.
- Builder Caddy relevé de Go 1.26.5 à 1.26.6 avec digest immuable après blocage CI des nouveaux CVE High de la bibliothèque standard.
- Digest Chainguard MinIO actualisé sur la révision corrigée après blocage des mêmes nouveaux CVE Go ; le digest Compose et celui scanné par la CI restent identiques.

## En cours

- RTA Web V2 est implémenté sur `codex/rta-web-v2` avec accueil et navigation remaniés, nouvelles pages de cadrage et environnement dev admin-only entièrement séparé. La production `RTAV2` n’est pas modifiée.
- Les nouveaux avis npm sur Browserslist, PostCSS Selector Parser et qs sont neutralisés par des versions transitives corrigées ; audit local à zéro vulnérabilité connue.
- Le build PostgreSQL met à niveau les paquets Alpine avant le passage en utilisateur non privilégié afin d’intégrer les correctifs OpenSSL/util-linux publiés après le dernier digest officiel.
- Le build Caddy force les versions corrigées et compatibles de `x/crypto`, `x/text` et gRPC-Go détectées par le scan binaire CI. L’image de migration appelle Prisma directement avec Node et retire npm/Corepack de son runtime pour ne pas embarquer leurs dépendances inutiles.
- L’environnement GitHub `development` est limité à la branche de travail et son déploiement distant reste désactivé jusqu’à l’installation de la configuration applicative VPS, de l’application OAuth Discord dédiée et au basculement du routage existant vers le port local `18081`.
- Aucun écart gameplay connu dans le périmètre implémenté. Les validations d’infrastructure réelle restent listées ci-dessous.

## Prochain

- Adaptateur réel de publication outbox, métriques, traces et alertes.
- Exercice documenté de sauvegarde/restauration et test E2E Discord sur un serveur de préproduction.

## Bloquants externes

- Preuves de licence des médias.
- Valeurs d’équilibrage non encore décidées hors boss et zones premium.
- Choix d’infrastructure et objectifs SLO/RPO/RTO.

## Dette confirmée

- L’outbox publie actuellement vers les logs structurés; Discord est traité par les adaptateurs dédiés, mais aucun broker distribué externe n’est encore configuré.
- Le test E2E réel des interactions Discord, l’exercice de restauration et les mesures de charge restent à exécuter dans l’infrastructure cible.
- Les preuves de licence des médias et les décisions d’hébergement restent externes au code.
