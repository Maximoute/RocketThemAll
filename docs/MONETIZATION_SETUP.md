# Configuration de la monétisation RTA

Les paiements sont volontairement coupés par défaut. Le code n’affiche un
bouton Stripe actif que si `RTA_PAYMENTS_ENABLED=true`, que la clé secrète, le
secret du webhook et le Price ID du produit sont tous présents.

## Catalogue de référence

| Clé RTA | Type | Prix | Livraison |
| --- | --- | ---: | --- |
| `vip_monthly` | abonnement utilisateur | 1,99 €/mois | badge VIP et +1 charge maximale |
| `founder_monthly` | abonnement utilisateur | 15,00 €/mois | avantages VIP et badge Fondateur |
| `credits_1000` | achat unique | 0,99 € | 1 000 crédits |
| `credits_12000` | achat unique | 9,99 € | 12 000 crédits, dont 2 000 offerts |

Fondateur ne donne pas plus de puissance que VIP. Le montant supplémentaire
sert à soutenir le projet.

## Stripe

1. Créer quatre produits et quatre prix dans le Dashboard Stripe.
2. Utiliser des prix mensuels récurrents pour VIP et Fondateur.
3. Utiliser des prix uniques pour les deux packs de crédits.
4. Définir le comportement fiscal et le code fiscal adaptés aux services et
   biens numériques avec le comptable. Activer Stripe Tax uniquement après la
   configuration des immatriculations fiscales.
5. Activer et configurer le Customer Portal pour permettre la résiliation et
   le téléchargement des factures.
6. Créer le webhook public :
   `https://DOMAINE/api/payments/stripe/webhook`.
7. Abonner ce webhook aux événements :
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
8. Reporter les valeurs dans `.env.production` :

```dotenv
RTA_PAYMENTS_ENABLED=false
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_AUTOMATIC_TAX_ENABLED=false
STRIPE_PRICE_VIP_MONTHLY=price_...
STRIPE_PRICE_FOUNDER_MONTHLY=price_...
STRIPE_PRICE_CREDITS_1000=price_...
STRIPE_PRICE_CREDITS_12000=price_...
```

Tester d’abord en mode test. Basculer `RTA_PAYMENTS_ENABLED=true` seulement
après vérification du webhook, des taxes, des pages légales et du parcours de
remboursement. Une page de retour Stripe ne livre rien à elle seule : seule la
validation du webhook signé attribue l’achat.

## Discord Premium Apps

1. Vérifier l’éligibilité de l’équipe et de l’application à la monétisation.
2. Créer un groupe d’abonnements utilisateur avec deux tiers : VIP et
   Fondateur. Discord interdit de mélanger abonnements utilisateur et
   abonnements de serveur dans une même application.
3. Créer deux SKU consommables pour les packs de crédits.
4. Publier les quatre SKU dans le Store et l’API.
5. Reporter leurs snowflakes :

```dotenv
DISCORD_MONETIZATION_ENABLED=false
DISCORD_SKU_VIP_MONTHLY=
DISCORD_SKU_FOUNDER_MONTHLY=
DISCORD_SKU_CREDITS_1000=
DISCORD_SKU_CREDITS_12000=
```

6. Activer avec `DISCORD_MONETIZATION_ENABLED=true`.

Le bot écoute les événements d’entitlement, resynchronise les entitlements au
démarrage et consomme un SKU de crédits seulement après une livraison réussie.
La clé unique de l’entitlement empêche une double attribution.

## Contrôles après activation

- Acheter chaque pack en test et vérifier une seule écriture dans le ledger.
- Rejouer le même webhook et vérifier que le solde ne change plus.
- Tester l’activation, la résiliation et l’expiration de VIP et Fondateur.
- Tester un entitlement Discord de test pour chaque abonnement.
- Tester la consommation des deux SKU de crédits.
- Contrôler `/admin/monetization` et corriger tout webhook `FAILED`.
- Vérifier que les clés `sk_` et `whsec_` ne figurent jamais dans le HTML, les
  logs applicatifs ou les variables `NEXT_PUBLIC_*`.
