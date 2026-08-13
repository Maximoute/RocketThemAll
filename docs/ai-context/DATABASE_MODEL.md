# Modèle de données cible

## Frontières d’agrégats

### Identité globale

- `User` : identifiant interne et identifiant Discord unique.
- `UserProgress` : XP, niveau et points de compétence.
- `InventoryItem`/`CardInstance` : collection et variantes globales.
- `UserItem`, `UserSkill`, `UserDailyQuest`, `UserAchievement`. Ce dernier persiste le compteur maximal, la date de déblocage et l’état de réclamation pour chaque définition jouable.
- `WeeklyCardOffer` matérialise les six cartes d’une semaine ; `WeeklyCardPurchase` relie une offre à son acheteur avec prix et clé d’idempotence.

### Contexte guilde

- `Guild`, `GuildConfig`, `GuildMember`; `Guild.isPrimary` désigne l’unique serveur principal administrable.
- `GuildConfiguration.hallOfFameChannelId` et `hallOfFameEnabled` : salon d’annonces exceptionnelles et activation indépendante pour chaque serveur.
- `GuildProgress` et déblocages de mondes/zones.
- `Encounter`, `CaptureAttempt` et `HallOfFameAnnouncement`.
- `BossRun` et contributions; `isPersistent` sépare les gardiens de monde durables des boss journaliers expirables.

### Contenu versionné

- `WorldDefinition`, `ZoneDefinition`, `Deck`, `Card`.
- `ItemDefinition`, `QuestDefinition`, `AchievementDefinition`, `SkillDefinition`, `BossDefinition`.
- Les clés de contenu sont stables et distinctes des identifiants techniques.

### Fiabilité

- `IdempotencyRecord` : portée, clé, empreinte de requête, statut et résultat.
- `EconomicLedgerEntry` : delta, solde avant/après, cause et acteur.
- `DomainEvent`/`OutboxEvent` : événement, version, payload et état de livraison.
- `ScheduledJob` : échéance, bail, tentatives et erreur.
- `FeatureFlag` : portée globale/guilde, valeur et audit.

## Contraintes essentielles

- Un seul hub actif par guilde.
- Un seul serveur principal.
- Une seule tentative par `(encounter_id, user_id)`.
- Un seul résultat principal par `(encounter_id, user_id)`.
- Une seule annonce Hall of Fame par tentative de capture.
- Une récompense de quête ou de succès au plus une fois.
- Une seule offre par `(weekKey, slot)`, une seule occurrence d’une carte par semaine et un achat au plus par `(userId, offerId)`.
- Une tâche de gardien au plus par `(guild_id, progression_id, slot)`.
- Au plus un boss journalier et un gardien persistant ouverts par guilde, garanti par un index partiel sur `(guildId, isPersistent)`; leurs contributions et leurs expirations restent indépendantes.
- Quantités et soldes non négatifs.
- Clés de définition uniques et insensibles aux renommages d’affichage.
- Toute ligne mutable critique possède `version` ou une transition d’état conditionnelle.

## Transactions

Les cas suivants doivent être réalisés dans une seule transaction :

- capture + ajout collection + XP + ledger + événement;
- achat + débit + octroi;
- ouverture de booster + consommation + tirages + octroi;
- échange + transfert des deux côtés + statut;
- fusion/chaudron + consommation + création + ledger;
- récompense de quête/succès/boss;
- déblocage de monde + changement de progression + outbox.

## Migrations

Les migrations sont montantes, revues et testées sur une copie de production. Une migration de données volumineuse est dissociée d’une contrainte finale. Les doublons existants sont détectés avant la création d’un index unique. Les migrations historiques contenant des index redondants doivent être rendues sûres avant reconstruction complète.

## Rétention

Les ledgers, audits, résultats de capture et événements économiques ne sont jamais supprimés par une action d’administration standard. Les données personnelles supprimables sont pseudonymisées conformément à la politique de rétention, tout en conservant l’intégrité comptable.
