# Guide de déploiement

## Environnements

Développement, préproduction et production utilisent des bases, buckets, applications Discord et secrets distincts. Aucune donnée de production n’est copiée en clair en développement.

## Préparation

1. Vérifier tests, build, audit de contenu, scans et licences.
2. Construire des images immuables avec provenance et digest.
3. Sauvegarder PostgreSQL et vérifier la lisibilité du backup.
4. Répéter migrations et rollback logique en préproduction.
5. Publier la configuration sous version.

## Ordre

1. Passer les jobs incompatibles en pause contrôlée.
2. Exécuter le job de migration unique.
3. Déployer API et worker compatibles avec ancien/nouveau schéma.
4. Déployer bot et web.
5. Activer les feature flags par canary.
6. Vérifier santé, erreurs, profondeur de queue et invariants économiques.

## Santé

- `live` : processus actif, sans dépendance externe.
- `ready` : base et dépendances indispensables disponibles, migrations compatibles.
- `startup` : initialisation terminée.

Le trafic n’est envoyé qu’aux instances prêtes. Le bot signale explicitement son état de connexion et le worker son dernier heartbeat.

## Retour arrière

Le rollback applicatif utilise l’image précédente. Les migrations sont conçues pour une période de compatibilité; une restauration DB n’est utilisée qu’après décision d’incident, car elle peut annuler des mutations joueurs. Les écritures compensatoires sont préférées pour l’économie.

## Sauvegarde

- sauvegardes complètes chiffrées;
- journaux permettant une restauration à un instant;
- rétention et accès restreints;
- exercice de restauration régulier sur un environnement isolé;
- mesure réelle des RPO/RTO.

## Incident

Geler via feature flags la mutation concernée, préserver logs/audits, identifier l’intervalle, produire une requête de réconciliation, appliquer des compensations idempotentes, puis documenter la cause et les contrôles ajoutés.

## État actuel

Le `docker-compose.yml` initial reste un environnement de développement et ne doit pas être utilisé en production.

La cible de production est `docker-compose.production.yml`. Elle construit les cibles `api`, `bot`, `worker`, `web` et `migrate` du `Dockerfile`, supprime MySQL/WordPress, exécute les processus avec un utilisateur non-root et un système de fichiers applicatif en lecture seule, attend les health checks et impose une migration réussie avant le trafic.

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

Ne jamais conserver les valeurs d’exemple. Les secrets doivent provenir du gestionnaire de secrets de la plateforme cible.

Le serveur principal est enregistré en base et peut être changé depuis le panneau d’administration; il ne dépend d’aucune variable d’environnement. Le Hall of Fame est activable séparément pour chaque guilde. `DISCORD_TOKEN` reste une variable serveur non exposée au navigateur et permet au panneau de lister les salons Discord disponibles.

### Développement privé RTA Web V2 — implémenté, non déployé

La branche `codex/rta-web-v2` dispose de son propre pipeline `.github/workflows/deploy-development.yml`. Il construit seulement `web`, `api`, `migrate` et PostgreSQL, puis cible `/srv/rocketthemall-dev` avec le projet Compose `rta-dev`. La production continue exclusivement depuis `RTAV2` avec son workflow et son projet Compose `rta` actuels.

L’environnement GitHub `development` existe et n’autorise que `codex/rta-web-v2`. Le déploiement distant reste volontairement désactivé tant que la variable de dépôt `RTA_DEV_DEPLOY_ENABLED` ne vaut pas `true`. Avant activation, installer `.env.development` depuis `.env.development.example`, créer une application OAuth Discord distincte avec le callback `https://dev.rocketthemall.com/api/auth/callback/discord`, puis faire pointer le routage VPS déjà existant vers le service dev local `127.0.0.1:18081`.

Les invariants obligatoires sont : volumes PostgreSQL/MinIO distincts, secrets et client OAuth différents de la production, aucun bot/worker/seed, bannière Development, cookies propres au domaine dev, `robots.txt` en `Disallow: /`, en-tête `X-Robots-Tag`, accès web/API/médias réservé à l’administrateur Discord configuré et sauvegarde de la base dev avant migration.

## Vérifications encore requises avant production

- construire et scanner chaque image dans la CI;
- rejouer toutes les migrations sur une copie de préproduction;
- effectuer un test de fumée API/web/bot/worker avec PostgreSQL et MinIO;
- vérifier une sauvegarde et une restauration chronométrées;
- brancher l’outbox au transport réel et tester ses doublons;
- fixer SLO, RPO, RTO, rétention et alertes.

Le démon Docker n’était pas disponible lors de la validation locale du 27 juillet 2026. La syntaxe Compose et les tags d’images ont été contrôlés, mais aucun succès de build d’image local n’est revendiqué.
