# Déploiement de Rocket Them All

La production utilise des images immuables construites par GitHub Actions. Le VPS ne clone pas le dépôt, ne compile pas Node.js et ne reçoit aucun secret applicatif depuis GitHub.

## Architecture

1. Un push sur `RTAV2` lance les tests de CI et le workflow de production.
2. GitHub construit six images (`api`, `bot`, `worker`, `web`, `migrate`, `postgres`) et les publie dans GHCR avec le SHA Git complet comme tag.
3. GitHub ouvre une connexion SSH avec le compte limité `deploy`, transfère uniquement les fichiers Compose/proxy et lance `scripts/deploy-vps.sh`.
4. Le script sauvegarde PostgreSQL avant une migration, télécharge les images, attend les healthchecks et bascule atomiquement le lien `/srv/rocketthemall/current`.
5. En cas d'échec, le script tente de redémarrer la version précédente.
6. Caddy gère automatiquement HTTPS sur 80/443. Nginx applique les limites, les en-têtes de sécurité et distribue les requêtes vers le web, l'API et MinIO.

PostgreSQL, MinIO, l'API et les services applicatifs ne publient aucun port sur Internet.

## État préparé sur le VPS

- Debian 12 à jour, Docker Engine et Compose installés.
- Connexion SSH sur le port 22 par clé uniquement.
- Connexion root et authentification par mot de passe désactivées.
- Comptes autorisés : `debian` pour l'administration et `deploy` pour GitHub Actions.
- Fail2ban actif sur SSH.
- Pare-feu hôte : SSH 22 uniquement, plus ICMP et trafic établi.
- Chaîne Docker `DOCKER-USER` : seuls TCP 80/443 et UDP 443 sont publiables.
- Répertoires de production sous `/srv/rocketthemall`, propriété de `deploy`.

Les fichiers reproductibles de cette configuration sont dans `ops/vps/`.

## Secrets applicatifs

Le seul fichier contenant les secrets de l'application est :

```text
/srv/rocketthemall/shared/.env.production
```

Il appartient à `deploy`, avec le mode `0600`. Il doit être créé depuis `.env.production.example`, sans aucune valeur `replace-me`, et ne doit jamais être commité. Pour le domaine actuel :

```dotenv
NEXTAUTH_URL=https://rocketthemall.com
PUBLIC_BASE_URL=https://rocketthemall.com
RTA_DOMAIN=rocketthemall.com
```

Dans le portail Discord, l'URL OAuth de redirection de production doit être exactement :

```text
https://rocketthemall.com/api/auth/callback/discord
```

## Secrets GitHub nécessaires

Créer un environnement GitHub nommé `production`, puis ajouter ces secrets d'environnement :

| Secret | Valeur attendue |
| --- | --- |
| `VPS_HOST` | `vps-73374e50.vps.ovh.net` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_PORT` | `22` |
| `VPS_SSH_PRIVATE_KEY` | clé privée dédiée à GitHub Actions |
| `VPS_SSH_KNOWN_HOSTS` | ligne `known_hosts` vérifiée du VPS |

Ne pas mettre les tokens Discord, Stripe, PostgreSQL ou MinIO dans GitHub : ils restent sur le VPS. La clé de déploiement n'a pas de mot de passe, est dédiée à ce workflow et sa clé publique est restreinte dans `authorized_keys`.

Avant d'enregistrer `VPS_SSH_KNOWN_HOSTS`, vérifier l'empreinte depuis la console OVH, puis générer la ligne :

```bash
ssh-keyscan -H -t ed25519 vps-73374e50.vps.ovh.net
```

Une réponse à `ssh-keyscan` ne prouve pas à elle seule l'identité du serveur ; la comparaison d'empreinte est obligatoire.

## Premier déploiement

Une fois les cinq secrets GitHub enregistrés et `.env.production` installé sur le VPS :

1. Ouvrir l'onglet **Actions** du dépôt.
2. Choisir **Deploy production**.
3. Utiliser **Run workflow** sur `RTAV2`, ou pousser un commit sur cette branche.
4. Attendre le test public `https://rocketthemall.com/api/health/ready`.

Le jeton GitHub temporaire sert uniquement à télécharger les images pendant le job. Le workflow se déconnecte ensuite de GHCR.

## Commandes d'exploitation

À exécuter en tant que `deploy` :

```bash
cd /srv/rocketthemall/current
docker compose --project-name rta \
  --env-file /srv/rocketthemall/shared/.env.production \
  -f docker-compose.production.yml \
  -f docker-compose.registry.yml ps

docker compose --project-name rta \
  --env-file /srv/rocketthemall/shared/.env.production \
  -f docker-compose.production.yml \
  -f docker-compose.registry.yml logs --tail=200 bot
```

Les sauvegardes PostgreSQL créées avant migration sont stockées dans `/srv/rocketthemall/backups`. Elles ne remplacent pas une sauvegarde quotidienne hors du VPS.

## DNS et Cloudflare

- Les entrées `A` du domaine et de `www` doivent pointer vers `137.74.173.219`.
- Le proxy Cloudflare peut rester activé.
- Après le premier certificat valide, utiliser le mode TLS **Full (strict)** dans Cloudflare.
- Ne jamais utiliser le mode **Flexible**, incompatible avec une origine HTTPS correctement sécurisée.

## Récupération

Le déploiement tente automatiquement un rollback si le démarrage ou le healthcheck échoue. Pour diagnostiquer :

```bash
journalctl -u docker -u rta-firewall --since "30 minutes ago"
sudo fail2ban-client status sshd
docker ps -a --filter name=rta-
df -h
free -h
```

Ne jamais lancer `docker compose down -v` en production : `-v` supprimerait les volumes de données.
