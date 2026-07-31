# Hypothèses de travail

| Hypothèse | Justification | Réversibilité |
|---|---|---|
| PostgreSQL reste la source de vérité | Prisma et migrations existants | élevée |
| Les identités/actifs personnels sont globaux | modèle hybride explicitement demandé | faible, décision structurante |
| Les états communautaires sont par guilde | conception du hub et des boss | faible |
| Les notes Core V2/V3 priment sur les exports historiques | elles sont plus récentes et cohérentes | élevée via version de contenu |
| UTC est utilisé pour stockage et quêtes quotidiennes | comportement déterministe multi-région | élevée pour l’affichage |
| Les probabilités utilisent des entiers en points de base ou millionièmes | évite les comparaisons flottantes ambiguës | élevée |
| Le broker/cache partagé n’est pas encore choisi | l’interface de job doit rester portable | élevée |
| Une zone premium se paie avec un Pass ou pour `prix du Pass + 50` crédits, sauf ouverture globale par la guilde | décision utilisateur et contrôle transactionnel existant | élevée |
| Les médias sans preuve de licence ne sont pas publiés | exigence de conformité | élevée |
| Le code historique est migré additivement | réduit le risque de perte | élevée |

## Limites

Les valeurs de progression proposées ne sont pas des décisions produit. Les documents les marquent explicitement comme provisoires et les feature flags doivent les garder désactivées jusqu’à simulation et validation.

## Politique d’hypothèse

Une hypothèse ne peut pas modifier silencieusement l’économie, les droits ou la confidentialité. Si une information manque dans ces domaines, le comportement sûr est le refus ou la désactivation contrôlée.
