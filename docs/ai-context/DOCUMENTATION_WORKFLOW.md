# Synchronisation de la documentation

## Règle de livraison

Une fonctionnalité RTA n’est terminée que lorsque le code et la théorie Obsidian décrivent le même comportement. Le Vault de travail est `../Vault-RTA` et sa politique normative est `03-Developpement/Règle de synchronisation Code - Obsidian.md`.

Chaque modification fonctionnelle doit mettre à jour :

1. la page Obsidian du domaine concerné ;
2. `00-Cockpit/État actuel de l'application.md` si le comportement courant ou déployé change ;
3. `00-Cockpit/Journal de bord - Application.md` avec date, commit, comportement et validations ;
4. le document `docs/ai-context` correspondant dans le dépôt.

## Routage

| Domaine modifié | Obsidian | Dépôt |
| --- | --- | --- |
| Exploration et capture | `Core Loop`, `Capture collective et préparation` | `GAME_SYSTEMS_INDEX.md`, `BALANCING_RULES.md` |
| Économie et Réacteur | `Économie des doublons` | `ECONOMY_MODEL.md`, `WEBSITE_FEATURES.md` |
| Boss et progression serveur | `Boss-System` | `GAME_SYSTEMS_INDEX.md`, `DISCORD_COMMANDS.md` |
| Site | `Frontend Pages - Next.js` | `WEBSITE_FEATURES.md` |
| Administration et sécurité | `Administration, fiabilité et analytics` | `SECURITY_MODEL.md`, `WEBSITE_FEATURES.md` |
| Prisma et migrations | `Prisma Models` | `DATABASE_MODEL.md` |
| VPS et CI/CD | `Administration, fiabilité et analytics` | `DEPLOYMENT_GUIDE.md`, `TECHNICAL_ARCHITECTURE.md` |

## Statuts à ne pas confondre

- **Proposé** : idée non codée ; elle doit être marquée comme proposition.
- **Implémenté** : présent dans la branche courante et testé.
- **Déployé** : présent sur le VPS et confirmé par les health checks.
- **Historique** : ancien comportement conservé uniquement dans le journal, jamais comme règle active.

## Contrôle de fin de tâche

- La page de domaine décrit les valeurs et règles réellement utilisées.
- Les anciennes valeurs contradictoires sont supprimées ou marquées obsolètes.
- Le journal cite le commit ou indique explicitement « non déployé ».
- Les liens Obsidian ajoutés pointent vers des notes existantes.
- Les documents générés ne sont jamais modifiés à la main.
