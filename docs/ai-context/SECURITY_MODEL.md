# Modèle de sécurité

## Menaces prioritaires

- usurpation d’identité via nom Discord ou identifiant fourni par le client;
- double dépense et double récompense par requêtes concurrentes;
- réexécution d’interactions Discord;
- accès croisé entre guildes;
- SSRF et épuisement mémoire lors d’imports d’images;
- exposition de secrets dans logs, bundles ou dépôt;
- abus de commandes et jobs;
- suppression irréversible par une action d’administration.

## Contrôles d’identité et d’accès

- Résoudre le `sub` Discord vérifié vers l’UUID interne.
- Recharger les rôles sensibles côté serveur pour les actions importantes.
- Appliquer une politique explicite `actor × action × resource × guild`.
- Refuser par défaut; ne jamais se fier à un bouton masqué.
- Enregistrer les refus sensibles avec corrélation, sans contenu secret.

### Configuration déléguée d’une guilde

- `/setup` exige `ManageGuild` dans la commande Discord et refait le contrôle dans le handler; la visibilité Discord de la commande ne constitue pas l’autorisation.
- `/setup` ne peut cibler que la guilde de l’interaction et un salon textuel résolu dans cette guilde.
- La page web `/setup` part du Discord ID immuable de la session, interroge l’API Discord avec le bot pour vérifier propriétaire, `Administrator` ou `ManageGuild`, puis refait ce contrôle lors de chaque mutation.
- Le salon soumis doit appartenir à la guilde active, être textuel et permettre au bot de voir, écrire, intégrer des liens et joindre des fichiers.
- Le service dédié ne modifie que `GuildConfiguration.gameChannelId`, incrémente sa version et écrit un audit; aucun droit global RTA n’est accordé.

## Mutations

- Validation de schéma stricte à la frontière.
- Clé d’idempotence et empreinte de requête.
- Transaction DB et transition d’état conditionnelle.
- Contraintes de non-négativité et d’unicité.
- Audit et événement sortant dans la transaction.

## Réseau et fichiers

Les imports distants n’acceptent que HTTPS, bloquent adresses privées/loopback/link-local après résolution DNS, limitent redirections, durée, taille et types MIME, et stockent sous une clé générée. L’objet n’est rendu visible qu’après validation; les objets orphelins sont nettoyés par job.

## Secrets

- Aucun secret réel dans le dépôt, les images ou la documentation.
- Secrets injectés par l’environnement de déploiement.
- Rotation immédiate si un secret est suspecté d’avoir été exposé.
- Valeurs sensibles expurgées des logs.
- `.env.example` contient seulement des marqueurs non fonctionnels.

Les images de production sont épinglées par digest et refusées par la CI lorsqu’un scanner détecte une vulnérabilité High/Critical. Le binaire Caddy 2.11.9 est recompilé avec Go 1.26.10 et le digest Chainguard MinIO est actualisé sur la révision corrigée afin d’intégrer les correctifs de sécurité publiés après les images amont.

### Bac à sable local

Le développement ne possède aucun point d'entrée Internet. Le projet Compose `rta-sandbox` lie ses ports uniquement à `127.0.0.1` et utilise un réseau, des volumes et des images propres, sans rejoindre aucun réseau Docker de production ni charger ses secrets. Le bot Discord est derrière un profil explicite afin qu'un démarrage normal ne contacte aucun service Discord avec des identifiants sensibles. Les valeurs intégrées par défaut sont locales et ne doivent jamais être réutilisées ailleurs.

Les versions transitives `browserslist 4.28.9`, `postcss-selector-parser 6.1.4` et `qs 6.16.0` sont imposées à la suite des avis publiés le 5 septembre 2026. `npm audit` revient ainsi à zéro vulnérabilité connue sans migration majeure d’Express.

L’image PostgreSQL applique les mises à jour de sécurité Alpine au moment de sa construction avant de retirer `gosu` et de repasser sous l’UID non privilégié. Ce passage corrige notamment OpenSSL 3.5.8 et util-linux 2.42.3 lorsque l’image officielle épinglée n’a pas encore été reconstruite.

Le binaire Caddy force également `golang.org/x/crypto 0.58.0`, `golang.org/x/net 0.62.0`, `go-jose/v4 4.1.6` et `google.golang.org/grpc 1.83.2`. L’avis `CVE-2026-116587` reste sans correctif pour `go-jose/v3`, dépendance transitive du module PKI Smallstep de Caddy. Une exception Trivy ciblée, documentée et limitée à cet identifiant est acceptée jusqu’au 25 janvier 2027 : la configuration reverse-proxy RTA n’expose aucune ingestion de JWK non fiable. Toutes les autres vulnérabilités High/Critical restent bloquantes.

## Limitation d’abus

Le rate limiting partagé utilise une identité fiable et une politique distincte par route/commande. La confiance proxy est configurée explicitement; un en-tête `x-forwarded-for` brut n’est pas une identité.

## Constat initial

Le prototype présente des risques confirmés : mutations économiques non atomiques, échange exécutable deux fois, rate limiter mémoire contournable, import d’image SSRF, pages identifiant l’utilisateur par username et suppressions administratives physiques. Ils sont des priorités de correction avant production.

## Vérification

La candidate Web V2 relève les correctifs de sécurité applicatifs vers Next.js 15.5.29, Express 4.22.3, body-parser 1.20.9, Sharp 0.35.5, Undici 6.29.1, Vitest 4.1.12 et les versions corrigées de `qs`, `proxy-addr`, `postcss-selector-parser` et `source-map-js`. Zod passe en 4.6.7 après validation de compilation et des tests API. `npm audit --audit-level=high` ne remonte plus aucune vulnérabilité sur le lockfile de la release.

La CI exécute tests d’autorisation, concurrence, idempotence, entrées malveillantes, dépendances et recherche de secrets. Un test négatif est requis pour chaque frontière privilégiée.
