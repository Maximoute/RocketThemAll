# Matrice de traçabilité

| Exigence | Source | Implémentation cible | Vérification | État |
|---|---|---|---|---|
| Identité globale, guilde locale | Prompt, Core V2 | schéma + politiques d’accès | tests multi-guildes | livré |
| Un hub par guilde | Salon Discord | `GuildHub` + clé active unique | test création concurrente | livré et protégé par unicité |
| Multi-capture | Capture collective | `Encounter`, `CaptureAttempt` | tests concurrence/idempotence | livré et testé sur PostgreSQL |
| Capture Discord sans double attribution | Bot existant | transaction + cooldown + idempotence | test PostgreSQL concurrent | livré et testé |
| Formule de capture | Core Gameplay V2 | `packages/game-engine` | tests de bornes et cas table | livré et testé |
| 9 mondes/81 zones | Contenu V2 | définitions versionnées | audit de contenu | importés et vérifiés en base |
| 27 × 30 cartes | catalogues | pipeline de contenu | audit distribution | 810 cartes importées et vérifiées en base |
| Variantes 98,9/1/0,1 | Core V2 | tirage déterministe | tests statistiques + bornes | livré et testé |
| Ledger économique | Prompt/économie | service transactionnel | tests double dépense | chemins critiques livrés et testés sur PostgreSQL |
| Fusion et exemplaire protégé | Économie doublons | service collection | tests quantité minimale | fusion, archives et protection du dernier exemplaire livrées |
| Booster 1 carte par tier | Objets V1 | service booster | tests mapping/tirage/rollback | livré et testé |
| 42 objets/3 artefacts | Objets V1 | définitions + équipement | validation inventaire | 42 définitions/médias, effets actifs et exactement 2 slots d’artefacts livrés |
| 45 compétences | Compétences V3 | arbre + allocations | tests prérequis/reset/couverture | 45 clés d’effet publiées reliées au runtime |
| 3 quêtes/jour | Quêtes | génération déterministe | tests fuseau/rejeu/récompense | moteur, attribution et récompenses livrés |
| 156 succès | Succès | consommateur d’événements | tests récompense unique | 144 achievements jouables + 12 modèles générateurs livrés |
| 17 boss | Boss | 17 définitions publiées + agrégat `BossRun` | tests scheduler/reprise/contributions | cinq mécaniques, trois catégories régulières, offrandes multi-ressources et récompenses Conquérant livrées |
| Gardiens hebdomadaires | Boss progression | job unique par slot | test planification DST/reprise | planification fuseau/DST et reprise des contributions destructives livrées |
| Contrats de collection | Compétences Courtier | séquestre + transfert atomique | test PostgreSQL règlement/expiration | recherche, don, réseau intelligent et remboursement livrés |
| Auth par Discord ID | Sécurité | résolveur central | tests IDOR | corrigé, tests de contrat requis |
| Anti-SSRF médias | Sécurité | fetch durci/worker | tests IP privées/MIME/taille | livré et testé |
| Jobs persistants | Prompt | worker + leases/outbox | tests crash/retry | worker, leases, retries et expirations livrés |
| Observabilité | Prompt | logs JSON/métriques/traces | test corrélation | logs/corrélation livrés, métriques à faire |
| Docker production | Prompt | Dockerfiles non-root + compose | smoke test | livré, build et smoke localhost validés |
| Sauvegarde/restauration | Prompt | runbook + exercice | restauration chronométrée | à faire |
| CI/CD | Prompt | workflow qualité/sécurité | branche protégée | workflow livré, protection distante à activer |
| Documentation persistante | Prompt | `docs/ai-context` | contrôle des 19 fichiers | livré et validé en CI |

## États

- `validé dans le vault` : contenu présent et contrôlé, pas nécessairement chargé en base.
- `conçu` : décision et contrat documentés.
- `en cours` : implémentation engagée mais pas encore entièrement validée.
- `à faire/à corriger` : écart confirmé.

Cette matrice doit être mise à jour dans le même changement que chaque fonctionnalité.
