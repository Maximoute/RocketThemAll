# Checklist sécurité production

## Déjà appliqué

- [x] SSH par clé uniquement sur le port 22.
- [x] Connexion root, mot de passe SSH, challenge-response et forwarding d'agent désactivés.
- [x] Fail2ban actif avec bannissement après cinq échecs.
- [x] Pare-feu hôte persistant et filtrage `DOCKER-USER` persistant.
- [x] Seuls 22/TCP, 80/TCP, 443/TCP et 443/UDP sont exposés selon leur couche.
- [x] Compte `deploy` dédié, sans sudo et avec clé GitHub Actions dédiée.
- [x] Secrets applicatifs conservés uniquement dans un fichier VPS en mode `0600`.
- [x] Conteneurs applicatifs en lecture seule, sans capabilities, avec `no-new-privileges`.
- [x] PostgreSQL, MinIO, API, web et bot non exposés directement sur l'hôte.
- [x] Images externes épinglées par digest.
- [x] Images RTA taguées avec un SHA Git immuable et attestées par GitHub.
- [x] Actions GitHub épinglées par SHA ; aucune action SSH tierce flottante.
- [x] Déploiement avec healthchecks, sauvegarde avant migration et rollback applicatif.
- [x] Caddy pour HTTPS automatique et Nginx pour rate limits/en-têtes de sécurité.
- [x] Journaux HTTP sans paramètres de requête afin d'éviter de conserver les codes OAuth.
- [x] Scan de secrets, audit npm et scan Trivy HIGH/CRITICAL dans la CI.

## Obligatoire avant l'ouverture publique

- [ ] Ajouter les cinq secrets à l'environnement GitHub `production`.
- [ ] Vérifier l'empreinte SSH par la console OVH avant d'enregistrer `known_hosts`.
- [ ] Vérifier que `/srv/rocketthemall/shared/.env.production` ne contient aucun placeholder.
- [ ] Régénérer tout token qui a déjà été envoyé dans un chat, un commit ou un log.
- [ ] Configurer l'URL OAuth Discord HTTPS de production.
- [ ] Activer Cloudflare TLS **Full (strict)** après émission du certificat Caddy.
- [ ] Activer le Network Firewall OVH avec 22/TCP, 80/TCP, 443/TCP et 443/UDP uniquement.
- [ ] Protéger l'environnement GitHub `production` et la branche `RTAV2` (MFA et approbation recommandées).
- [ ] Compléter les mentions légales et les coordonnées RGPD dans `.env.production`.
- [ ] Garder les paiements désactivés tant que Stripe, les webhooks, la fiscalité et les textes légaux ne sont pas validés.

## Sauvegardes et exploitation

- [ ] Configurer une sauvegarde quotidienne chiffrée de PostgreSQL et MinIO hors du VPS.
- [ ] Configurer au moins 30 jours de rétention.
- [ ] Restaurer réellement une sauvegarde sur un environnement isolé une fois par mois.
- [ ] Activer les snapshots automatiques OVH ; ils complètent mais ne remplacent pas l'export hors site.
- [ ] Ajouter une alerte externe pour HTTPS, espace disque, RAM et état du bot.
- [ ] Définir une rotation des secrets et supprimer immédiatement les anciennes clés.
- [ ] Vérifier chaque mois `apt`, les images, les dépendances et les alertes Dependabot.

## Contrôles après chaque déploiement

- [ ] Le job GitHub **Deploy production** est vert.
- [ ] `https://rocketthemall.com/api/health/ready` répond en HTTPS.
- [ ] Le certificat couvre le domaine et `www`.
- [ ] `docker compose ps` montre tous les services attendus comme sains.
- [ ] Le bot Discord est connecté une seule fois et les commandes ne sont pas dupliquées.
- [ ] L'authentification Discord revient sur le domaine de production.
- [ ] Les logs ne contiennent ni token, ni mot de passe, ni erreur répétée.
- [ ] Le pare-feu n'expose aucun port de base de données, MinIO, API ou Next.js.

## Réponse à incident

1. Isoler le service touché sans effacer les données ni les logs.
2. Révoquer les tokens/clés concernés.
3. Préserver les journaux et identifier l'étendue de l'accès.
4. Corriger, tester, redéployer une image immuable.
5. Restaurer si nécessaire et documenter l'incident.
6. Évaluer les obligations de notification RGPD avec un professionnel compétent.
