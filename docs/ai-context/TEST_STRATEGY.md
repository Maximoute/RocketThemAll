# Stratégie de test

## Pyramide

- Tests purs : probabilités, bornes, règles, transitions et génération déterministe.
- Tests de services avec PostgreSQL réel : transactions, contraintes, verrous et rollback.
- Tests de contrats : API, interactions Discord signées et contenu.
- Tests d’intégration : bot/API/worker/site avec dépendances conteneurisées.
- Tests E2E : parcours critiques joueur/admin.
- Tests non fonctionnels : charge, sécurité, restauration et reprise après crash.

## Cas critiques obligatoires

### Concurrence

- deux captures du même joueur et de la même rencontre;
- deux achats avec le dernier solde disponible;
- deux ouvertures du dernier booster;
- double confirmation/exécution d’un échange;
- deux schedulers créant le même boss;
- deux récompenses du même succès.

### Idempotence

Même clé + même empreinte retourne le même résultat. Même clé + empreinte différente est refusée. Une reprise après crash entre commit et réponse ne répète pas les effets.

### Temps

- minuit UTC;
- changement d’heure Europe/Brussels;
- interactions juste avant/après expiration;
- worker en retard;
- durée maximale et tentative de rattrapage.

### Sécurité

- ID utilisateur/guilde forgé;
- utilisateur absent d’une guilde;
- rôle retiré après chargement de page;
- URL privée, redirection privée, DNS rebinding simulé, fichier trop gros, MIME trompeur;
- custom ID altéré ou expiré;
- entrée riche hostile et injection.

### Contenu

- comptes et distribution par deck;
- références et assets;
- taux total égal à 100 %;
- clés d’effet sur liste blanche;
- migration de version et rollback.

## Déterminisme

Le moteur reçoit une source pseudo-aléatoire ou un seed. Les tests n’utilisent jamais `Math.random()` directement. Les tests statistiques complètent, mais ne remplacent pas, les tests exacts des frontières.

## CI

Ordre minimal : format/lint, typecheck, tests purs, validation Prisma, tests DB, build, audit contenu, scan secrets/dépendances/images. Aucun test en échec n’est neutralisé sans justification datée.
