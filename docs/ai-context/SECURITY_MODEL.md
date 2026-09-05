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

Les images de production sont épinglées par digest et refusées par la CI lorsqu’un scanner détecte une vulnérabilité High/Critical. Le binaire Caddy 2.11.4 est recompilé avec Go 1.26.6 et le digest Chainguard MinIO est actualisé sur la révision corrigée afin d’intégrer les correctifs Go publiés en août 2026.

### Développement privé du site

La branche RTA Web V2 applique une défense en profondeur sur `dev.rocketthemall.com` : middleware Next signé, relecture de `User.isAdmin` côté serveur, garde globale de l’API Express et sous-requête d’autorisation Nginx devant les médias. Les endpoints de santé, la page de connexion et les callbacks OAuth restent les seules exceptions nécessaires. Une session authentifiée sans droit admin reçoit un refus 403.

La session dev utilise `__Secure-rta-dev.session-token`, un secret NextAuth et une application Discord dédiés. Le Compose `rta-dev` possède ses propres volumes et n’exécute ni bot, ni worker, ni seed. Le script de déploiement refuse les secrets critiques identiques à la production et une base dont le nom n’identifie pas explicitement l’environnement dev. Cette configuration est implémentée mais pas encore déclarée déployée.

Les versions transitives `browserslist 4.28.9`, `postcss-selector-parser 6.1.4` et `qs 6.16.0` sont imposées à la suite des avis publiés le 5 septembre 2026. `npm audit` revient ainsi à zéro vulnérabilité connue sans migration majeure d’Express.

## Limitation d’abus

Le rate limiting partagé utilise une identité fiable et une politique distincte par route/commande. La confiance proxy est configurée explicitement; un en-tête `x-forwarded-for` brut n’est pas une identité.

## Constat initial

Le prototype présente des risques confirmés : mutations économiques non atomiques, échange exécutable deux fois, rate limiter mémoire contournable, import d’image SSRF, pages identifiant l’utilisateur par username et suppressions administratives physiques. Ils sont des priorités de correction avant production.

## Vérification

La CI exécute tests d’autorisation, concurrence, idempotence, entrées malveillantes, dépendances et recherche de secrets. Un test négatif est requis pour chaque frontière privilégiée.
