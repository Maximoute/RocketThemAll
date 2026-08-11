# Conflits et décisions

## ADR-001 — Périmètre de contenu

- Conflit : anciennes notes à 10 mondes et nombre variable de zones; spécification récente à 9 mondes et 9 zones par monde.
- Décision : 9 mondes, 81 zones, 27 decks.
- Motif : documents Core V2 et inventaire actuel cohérents.

## ADR-002 — Taxonomie des raretés

- Conflit : anciennes raretés `Epic/Legendary/Mythic`; contenu actuel `Common/Uncommon/Rare/Very Rare/Import/Exotic/Black Market`.
- Décision : utiliser exclusivement les sept raretés actuelles du Vault.

## ADR-003 — Taux de variantes

- Conflit : `_data/card_variants.csv` donne `94/5/1`; Core V2 et fiches actuelles donnent `98,9/1/0,1`.
- Décision : Normal 98,9 %, Shiny 1 %, Holo 0,1 %.
- Action : marquer l’ancien CSV comme obsolète ou le régénérer.

## ADR-004 — Capture

- Conflit : code existant à gagnant unique; conception récente multi-capture.
- Décision : une tentative et un résultat indépendants par joueur éligible.
- Conséquence : `Encounter` et `CaptureAttempt` portent l’intégralité de cette boucle.

## ADR-005 — Boosters

- Conflit : le service historique tirait plusieurs cartes par booster standard.
- Décision : une seule carte du tier exact pour un booster standard; trois cartes tirées et une gardée pour le booster de conquérant.

## ADR-006 — Portée des données

- Conflit : code historique surtout global, exigences communautaires par serveur.
- Décision : identité/collection/objets/crédits/progression personnelle globaux; configuration/progression/boss/déblocages locaux à la guilde.

## ADR-007 — Autorité des effets d’objets

- Conflit : contenu flexible contre risque d’exécution de formules.
- Décision : clés d’effets composables et paramètres validés sur liste blanche; aucune formule exécutable chargée depuis JSON.

## ADR-008 — Suppression administrative

- Conflit : retrait logique normal contre remplacement complet du catalogue source.
- Décision : les contenus Vault retirés sont purgés pendant l’import autoritaire; les données économiques utilisent des opérations compensatoires.

## ADR-009 — Fuseaux

- Décision : stockage UTC; reset des quêtes à minuit UTC. Les créneaux de gardiens utilisent par défaut `Europe/Brussels` tant qu’une configuration de guilde n’est pas validée.

## ADR-010 — Branche de reprise

- Décision : poursuivre depuis `origin/refactor/architecture` dans `codex/rta-complete`.
- Motif : branche distante la plus récente et cohérente; l’arbre de travail utilisateur d’origine reste intact.

## ADR-011 — Replay des migrations historiques

- Constat : `20260430230000_add_import_fields` et `20260501010000_add_source_indexes` créaient les deux mêmes index et faisaient échouer une base vierge.
- Décision : rendre la seconde création idempotente avec `IF NOT EXISTS`.
- Exploitation : si la migration a déjà été enregistrée dans un environnement partagé, comparer le checksum et utiliser la procédure Prisma `migrate resolve` documentée après vérification; ne jamais modifier directement la table de migrations.

## ADR-012 — Composition transitoire des boosters

- Décision normative : une carte aléatoire par booster, sans restriction de deck.
- Correspondance : `basic = Common`, `rare = Rare`, `epic = Very Rare`,
  `legendary = Black Market`.
- Aucun jackpot ne change automatiquement le tier du booster.

## ADR-013 — Capture et encens

- Décision utilisateur : une bonne réponse donne exactement 95 % de chance de capture, quel que soit le tier; l’échec conserve la formule fortement pénalisée.
- Décision utilisateur : un encens porte son tier cible à 50 % et applique 5 % Shiny / 1 % Holo à la run.
- Conséquence : les bonus de compétence donnent de l’information ou une nouvelle tentative, mais ne dépassent pas les 95 % d’une bonne réponse.

## ADR-014 — Énergie d’exploration

- Décision utilisateur : quatre charges de base et régénération d’une charge toutes les cinq minutes.
- Décision utilisateur : les comptes administrateurs marqués `unlimitedExplorations` ne consomment aucune charge.

## ADR-015 — Cycle des boss

- Décision utilisateur : un boss standard par jour, créé à minuit dans le fuseau de la guilde et actif pendant 24 heures.
- Les gardiens de progression n’occupent plus le créneau journalier : un gardien persistant et un boss standard temporaire peuvent être actifs simultanément sur le même serveur.
- Les contributions destructives d’un gardien expiré sont reprises lors de la tentative suivante.

## ADR-016 — Équipement

- Décision utilisateur : deux emplacements d’artefacts fixes sur le profil.
- Les objets consommables choisis avant la zone ou pendant la capture utilisent des emplacements et effets séparés.

## ADR-017 — Concurrence des explorations

- Décision utilisateur : chaque lancement commence en privé pour son initiateur; son résultat est résolu immédiatement et indépendamment.
- Une minute après le résultat privé, la rencontre devient publique pour les autres joueurs sans republier le résultat à l’initiateur.

## ADR-018 — Tier d’apparition et économie des boss

- Décision utilisateur : tout tier de boss régulier peut apparaître dans tout monde; son monde ne détermine ni son tier ni sa récompense.
- Pondération V1 : `30/25/20/13/8/4` de Common à Exotic, tirage déterministe par apparition.
- Les huit gardiens ont un tier fixe croissant avec le passage qu’ils protègent; les trois derniers sont Exotic.
- Difficulté, fragments garantis, exigences rituelles, limite de Fleurs, booster et coffre du Conquérant utilisent le tier immuable stocké dans le snapshot du run.
- Les récompenses du Conquérant conservent des jets indépendants; en cas de succès, l’objet obtenu porte exactement le tier du boss.
- Une zone premium coûte le prix de référence du Pass d’expédition + 50 crédits, avant un éventuel modificateur temporaire d’Envahisseur.

## ADR-019 — Réacteur de collection

- Décision utilisateur : le Réacteur appartient à la Collection et non à la navigation principale.
- Chaque opération consomme exactement cinq exemplaires explicitement choisis.
- Mode Deck : cinq cartes du même deck, sortie manquante de ce deck; deck normal complet, priorité aux variantes manquantes.
- Mode Tier : cinq cartes du même tier, sortie manquante du tier supérieur.
- Mode Vrac : cinq cartes libres, sortie prioritairement non possédée.
- L’interface doit filtrer les cartes incompatibles avant confirmation et montrer leurs images; le backend conserve la validation transactionnelle autoritaire.

## ADR-020 — Classement central des serveurs

- Seules les guildes présentes dans le cache du client Discord et actives en base sont classées.
- Score : `100 × (mondes débloqués - 1) + pourcentage du monde courant`.
- Le message affiche au maximum dix serveurs, avec rang, progression, boss actifs et icône Discord disponible.

## ADR-021 — Synchronisation Code ↔ Obsidian

- Décision utilisateur : toute fonctionnalité ajoutée, modifiée ou supprimée met à jour la théorie Obsidian concernée pendant le même travail.
- La page de domaine porte la règle, `État actuel de l'application` résume le déployé et `Journal de bord - Application` conserve la chronologie.
- Une proposition non implémentée doit être étiquetée comme telle; elle ne peut pas rester mélangée au comportement de production.
