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

## Limitation d’abus

Le rate limiting partagé utilise une identité fiable et une politique distincte par route/commande. La confiance proxy est configurée explicitement; un en-tête `x-forwarded-for` brut n’est pas une identité.

## Constat initial

Le prototype présente des risques confirmés : mutations économiques non atomiques, échange exécutable deux fois, rate limiter mémoire contournable, import d’image SSRF, pages identifiant l’utilisateur par username et suppressions administratives physiques. Ils sont des priorités de correction avant production.

## Vérification

La CI exécute tests d’autorisation, concurrence, idempotence, entrées malveillantes, dépendances et recherche de secrets. Un test négatif est requis pour chaque frontière privilégiée.
