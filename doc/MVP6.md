# Étape 6 — Billing SaaS (Plans Free / Pro / Business via GeniusPay)

**Dev assigné :** Dev 1 (retour au socle) ou nouveau dédié
**Prérequis :** Étapes 1 à 5 mergées, MVP fonctionnel en prod.
**Durée estimée :** 8-10 jours
**Objectif :** Monétiser la plateforme. Chaque org souscrit à un plan (Free, Pro, Business) qui débloque des quotas (membres, projets, API keys, webhooks, stockage, appels API). Les abonnements payants sont encaissés via **GeniusPay** (compte marchand **Excellence**, pas celui de l'org — c'est Excellence qui vend l'accès SaaS). Facturation mensuelle avec renouvellement automatique.

**Livrable final :** un système où une org peut voir son plan actuel, upgrader vers Pro/Business, être facturée mensuellement, voir sa consommation de quotas en temps réel, et se voir bloquée proprement en cas de dépassement ou d'impayé.

> ⚠️ **Prérequis obligatoire :** lire et appliquer [`standards-dev.md`](./standards-dev.md).

---

## 1. Portée exacte

### 1.1 Inclus
- Définition des 3 plans (Free, Pro, Business) et leurs quotas.
- Souscription et changement de plan.
- Facturation mensuelle via GeniusPay compte marchand **Excellence** (distinct du GeniusPay de l'org, Étape 3).
- Renouvellement automatique + gestion des échecs (dunning : relances, grace period, downgrade).
- Enforcement des quotas en temps réel (bloquant à la création).
- Dashboard de consommation.
- Facture SaaS émise à l'org à chaque cycle.
- Historique des cycles et paiements.

### 1.2 Exclus
- Pas de facturation à l'usage (metered billing) au MVP — quotas fixes par plan.
- Pas de facturation à la carte de crédit hors GeniusPay (Stripe possible post-MVP).
- Pas de coupons/promo codes au MVP.
- Pas de facturation annuelle avec remise — mensuel uniquement au MVP.

---

## 2. Distinction critique : deux comptes GeniusPay

| Compte GeniusPay | Qui | Utilisation | Où |
|---|---|---|---|
| **Excellence Merchant** | Excellence Team (nous) | Encaisser les abonnements SaaS des orgs (**Étape 6, ce doc**) | Clés stockées en env `EXCELLENCE_GENIUSPAY_*` |
| **Org Merchant** | Chaque org cliente | Encaisser les factures que l'org émet à SES clients (**Étape 3**) | Clés stockées chiffrées dans `payment_gateway_credentials` |

> **Révisé le 18/08/2026** : GeniusPay ne propose pas encore plusieurs comptes
> marchands par utilisateur. Les deux flux partagent donc un compte unique,
> distingués par `metadata.kind`. Voir `doc/COMPTE-EXCELLENCE.md`.

**Ne jamais mélanger.** Les tables et endpoints Étape 6 utilisent exclusivement le compte Excellence. Les tables Étape 3 (`payment_gateway_credentials`) ne concernent jamais le billing SaaS.

---

## 3. Définition des plans

Source de vérité TypeScript, versionnée dans le repo :

```ts
// src/lib/billing/plans.ts
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyCents: 0,
    currency: 'XOF',
    quotas: {
      maxMembers: 3,
      maxClients: 10,
      maxProjects: 5,
      maxApiKeys: 1,
      maxWebhookEndpoints: 1,
      maxStorageBytes: 500 * 1024 * 1024,        // 500 Mo
      maxApiCallsPerMonth: 1_000,
      maxPublicTokensPerMonth: 50,
      pdfBrandingRemovable: false,               // "Powered by Excellence" en footer
      supportLevel: 'community',
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyCents: 15_000_00,                // 15 000 XOF/mois
    currency: 'XOF',
    quotas: {
      maxMembers: 15,
      maxClients: 200,
      maxProjects: 100,
      maxApiKeys: 10,
      maxWebhookEndpoints: 10,
      maxStorageBytes: 10 * 1024 * 1024 * 1024,  // 10 Go
      maxApiCallsPerMonth: 100_000,
      maxPublicTokensPerMonth: 5_000,
      pdfBrandingRemovable: true,
      supportLevel: 'email',
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthlyCents: 50_000_00,                // 50 000 XOF/mois
    currency: 'XOF',
    quotas: {
      maxMembers: null,                          // illimité
      maxClients: null,
      maxProjects: null,
      maxApiKeys: 50,
      maxWebhookEndpoints: 50,
      maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 Go
      maxApiCallsPerMonth: 1_000_000,
      maxPublicTokensPerMonth: 50_000,
      pdfBrandingRemovable: true,
      supportLevel: 'priority',
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;
```

Prix ajustables par Oktav avant lancement (études de marché déjà faites, ces montants sont indicatifs).

---

## 4. Schéma DB

### 4.1 Souscriptions et cycles

```
subscriptions
  id                      uuid PK
  organization_id         uuid FK → organizations(id) ON DELETE CASCADE UNIQUE
  plan_id                 text NOT NULL              (free | pro | business)
  status                  text NOT NULL              (enum: 'active'|'past_due'|'grace_period'|'cancelled'|'downgraded_to_free')
  current_period_start    timestamptz NOT NULL
  current_period_end      timestamptz NOT NULL
  cancel_at_period_end    boolean DEFAULT false
  cancelled_at            timestamptz NULL
  trial_end               timestamptz NULL           (préparé pour offres d'essai, null MVP)
  created_at, updated_at

subscription_cycles                                  (facture SaaS mensuelle)
  id                      uuid PK
  subscription_id         uuid FK → subscriptions(id) ON DELETE CASCADE
  organization_id         uuid FK                    (redondant pour perf/RLS)
  cycle_number            integer NOT NULL           (1, 2, 3... par subscription)
  plan_id                 text NOT NULL              (snapshot du plan à ce cycle)
  amount_cents            bigint NOT NULL
  currency                text NOT NULL DEFAULT 'XOF'
  period_start            timestamptz NOT NULL
  period_end              timestamptz NOT NULL
  status                  text NOT NULL              (enum: 'pending'|'paid'|'failed'|'refunded'|'skipped_free')
  invoice_number          text UNIQUE NOT NULL       (ex: "SAAS-2026-000042")
  invoice_pdf_file_id     uuid FK → files(id) NULL   (facture SaaS générée en Étape 4 style)
  paid_at                 timestamptz NULL
  failed_reason           text NULL
  created_at              timestamptz DEFAULT now()

  UNIQUE(subscription_id, cycle_number)
  INDEX idx_cycles_org ON subscription_cycles(organization_id, created_at DESC)

subscription_payment_attempts
  id                      uuid PK
  cycle_id                uuid FK → subscription_cycles(id) ON DELETE CASCADE
  organization_id         uuid FK
  attempt_number          integer NOT NULL
  gateway_reference       text NULL                  (MTX-... de GeniusPay Excellence)
  checkout_url            text NULL
  status                  text NOT NULL              (pending|succeeded|failed|expired)
  amount_cents            bigint NOT NULL
  failure_reason          text NULL
  created_at, updated_at

  UNIQUE(gateway_reference) WHERE gateway_reference IS NOT NULL
```

### 4.2 Consommation des quotas

```
quota_usage
  organization_id         uuid PK FK → organizations(id) ON DELETE CASCADE
  members_count           integer NOT NULL DEFAULT 0
  clients_count           integer NOT NULL DEFAULT 0
  projects_count          integer NOT NULL DEFAULT 0
  api_keys_count          integer NOT NULL DEFAULT 0
  webhook_endpoints_count integer NOT NULL DEFAULT 0
  storage_bytes           bigint NOT NULL DEFAULT 0     (déjà présent Étape 4 dans storage_usage — à consolider)
  last_recomputed_at      timestamptz DEFAULT now()

quota_period_usage                                   (compteurs par période mensuelle)
  organization_id         uuid FK
  period_start            date NOT NULL              (1er du mois)
  api_calls_count         bigint NOT NULL DEFAULT 0
  public_tokens_created   integer NOT NULL DEFAULT 0

  PRIMARY KEY(organization_id, period_start)
```

Triggers PostgreSQL sur les tables métier maintiennent `quota_usage` :
- INSERT sur `memberships` → `members_count + 1` ; DELETE → `- 1`.
- Idem pour clients, projects, api_keys, webhook_endpoints.
- `storage_bytes` déjà géré par triggers de l'Étape 4.

Compteurs de période (`api_calls_count`, `public_tokens_created`) : incrémentés par middleware/service à chaque événement, remis à zéro le 1er de chaque mois via cron.

---

## 5. Enforcement des quotas — deux niveaux

### 5.1 Preflight (bloquant)

Avant chaque création d'entité soumise à quota, appel `assertQuota(orgId, quotaKey)` :

```
assertQuota(orgId, 'maxMembers'):
  plan = getSubscription(orgId).plan
  limit = PLANS[plan].quotas.maxMembers
  if limit === null: return OK
  current = quota_usage.members_count
  if current >= limit: throw QuotaExceededError
```

Réponse standardisée : `403 QUOTA_EXCEEDED` avec `{ quota, current, limit, plan, upgradeUrl }`.

Points de vérification :
- Ajout membre / invitation acceptée
- Création client, projet, api_key, webhook_endpoint, public_token
- Upload (contre `maxStorageBytes` déjà en place Étape 4)

### 5.2 Compteur d'API calls

Middleware après auth :
```
incrementApiUsage(orgId): INCR quota_period_usage.api_calls_count
if usage > limit: soft warning header X-Quota-Warning
if usage > limit × 1.1: 429 QUOTA_EXCEEDED
```

10% de tolérance pour ne pas bloquer brutalement au dernier appel du mois.

### 5.3 Downgrade — enforcement rétroactif

Une org qui passe de Pro à Free avec 30 membres ne perd pas ses données :
- Downgrade autorisé, mais toute **création future** est bloquée jusqu'à ce que la conso passe sous les nouveaux quotas.
- Un banner permanent affiche "Votre org dépasse les quotas Free ; upgradez ou réduisez à N membres".
- Aucune suppression automatique — l'org agit ou re-upgrade.

---

## 6. Cycle de facturation

### 6.1 Création de subscription

Au signup d'une nouvelle org : subscription auto en `free` (period_end = date lointaine sans facturation).

Upgrade vers plan payant :
```
POST /api/v1/billing/subscribe { planId: 'pro' | 'business' }
  → crée subscription_cycle #1 (period 30 jours à partir d'aujourd'hui)
  → crée subscription_payment_attempts #1
  → appelle GeniusPay Excellence (mode checkout hébergé) avec metadata
    { org_id, cycle_id, attempt_id, plan_id, kind: 'saas_subscription' }
  → renvoie { checkoutUrl }
  → subscription reste en 'free' ou statut pending tant que webhook success non reçu
```

### 6.2 Webhook GeniusPay Excellence (endpoint dédié)

**Distinct** du webhook `/api/v1/webhooks/geniuspay` de l'Étape 3 (celui-ci sert les paiements factures clients). Nouveau :

```
POST /api/v1/webhooks/geniuspay-excellence
```

Pipeline identique (HMAC, timestamp, replay, re-fetch) mais utilise `EXCELLENCE_GENIUSPAY_WEBHOOK_SECRET` en env, pas les credentials d'une org. Les événements sont routés via `metadata.kind === 'saas_subscription'` puis `metadata.attempt_id` pour identifier le cycle.

Sur `payment.success` :
- Marque `subscription_payment_attempts` en `succeeded`
- Marque `subscription_cycles` en `paid`
- Active/renouvelle la subscription (`status='active'`, `current_period_end = period_end`)
- Génère la facture SaaS PDF (via pipeline Étape 4)
- Émet event `subscription.activated` ou `subscription.renewed`
- n8n (Étape 5) envoie l'email de confirmation

Sur `payment.failed` :
- Marque attempt en `failed`
- Déclenche dunning (voir §6.4)

### 6.3 Renouvellement automatique

Cron quotidien (via n8n Étape 5 appelant `/api/internal/cron/renew-subscriptions`) :

```
Pour chaque subscription active avec current_period_end < now + 3j:
  crée subscription_cycle N+1
  crée payment_attempt #1
  appelle GeniusPay Excellence
  envoie email au client avec le lien de paiement (n8n)
```

Le client doit compléter le paiement avant `period_end` pour rester actif.

### 6.4 Dunning (gestion des impayés)

```
period_end atteint sans paiement:
  J+0    : subscription passe en 'past_due', email urgent envoyé
  J+3    : nouvelle tentative de paiement (attempt #2)
  J+7    : nouvelle tentative (attempt #3), email "grace period commence"
  J+7 → J+14: subscription en 'grace_period', service reste actif
  J+14   : downgrade automatique en Free (subscription.status='downgraded_to_free', plan_id='free')
           → banner permanent : "Compte rétrogradé, veuillez régulariser"
           → aucune donnée perdue
```

Un paiement manuel du cycle en retard restaure le plan et la période.

### 6.5 Annulation

```
POST /api/v1/billing/cancel
  → subscription.cancel_at_period_end = true
  → aucun changement immédiat, l'org garde l'accès jusqu'à period_end
  → à period_end : downgrade auto en Free (pas de suppression de données)
```

Réactivation : `POST /api/v1/billing/reactivate` avant `period_end` remet `cancel_at_period_end = false`.

---

## 7. Routes API

Toutes sous `/api/v1/billing/*`, session uniquement (jamais API key ni public token — la facturation est un domaine sensible).

```
GET    /billing/plans                     → liste des plans + prix (public possible pour landing page)
GET    /billing/subscription              → subscription courante de l'org
GET    /billing/usage                     → quotas + conso actuelle
POST   /billing/subscribe                 { planId }
POST   /billing/change-plan               { planId }      → upgrade immédiat, downgrade à period_end
POST   /billing/cancel                    (schedule)
POST   /billing/reactivate

GET    /billing/cycles                    → historique des cycles
GET    /billing/cycles/:id                → détails d'un cycle
GET    /billing/cycles/:id/invoice/download   → PDF facture SaaS

GET    /billing/payment-attempts?cycleId=... → historique tentatives
POST   /billing/payment-attempts/:id/retry   → relance manuelle si failed
```

Endpoints internes (cron n8n) :
```
POST /api/internal/cron/renew-subscriptions
POST /api/internal/cron/process-dunning
POST /api/internal/cron/reset-monthly-usage
```

Permissions : `owner` uniquement pour changer/annuler. `admin` peut lire.

---

## 8. Facture SaaS

Nouvelle table minimale ou réutilisation du template `invoice-v1.tsx` (Étape 4) avec un flag `kind='saas'` :
- Émetteur : Excellence Team (coordonnées configurables via env `EXCELLENCE_LEGAL_*`).
- Destinataire : org (nom, email owner, adresse si renseignée).
- Ligne unique : nom du plan + période.
- TVA : selon régime fiscal Excellence (à valider avec comptable, potentiellement 0% intra-UEMOA).

Numérotation `SAAS-<YEAR>-<NNNNNN>` sur séquence dédiée.

Envoi email post-paiement via n8n (Étape 5, workflow `email_saas_invoice_paid_v1.json` à ajouter).

---

## 9. Sécurité — additions Étape 6

- [ ] `EXCELLENCE_GENIUSPAY_*` (public, secret, webhook_secret) en env stricts, jamais commit, jamais logué.
- [ ] Endpoint `/webhooks/geniuspay-excellence` distinct, pipeline HMAC identique à l'Étape 3.
- [ ] `assertQuota` appelé **avant** toute mutation ; test unitaire par point de contrôle.
- [ ] Downgrade ne supprime **jamais** de données ; test explicite : downgrade Pro→Free avec 20 clients → 0 client supprimé.
- [ ] Changement de plan uniquement par owner ; test explicite qu'un admin échoue.
- [ ] Aucune API key ni public token ne peut souscrire ou annuler — session obligatoire.
- [ ] Race condition : deux `POST /subscribe` simultanés → un seul cycle créé (UNIQUE constraint + upsert transactionnel).
- [ ] Rejeu webhook renewal : `UNIQUE(gateway_reference)` sur `subscription_payment_attempts` bloque le double-crédit.
- [ ] Grace period : le service reste actif, testé par un test d'intégration qui simule J+10 après échéance.
- [ ] Audit log : `subscription.created`, `subscription.upgraded`, `subscription.downgraded`, `subscription.cancelled`, `subscription.reactivated`, `subscription.past_due`, `subscription.grace_period`, `subscription.paid`, `subscription.payment_failed`.

---

## 10. Ce que Dev 6 ne fait PAS

- Pas de metered billing (facturation à l'usage).
- Pas de facturation annuelle.
- Pas de coupons/promo codes.
- Pas de facturation multi-devise (XOF uniquement pour Excellence, roadmap USD/EUR post-lancement international).
- Pas d'intégration Stripe (roadmap).
- Pas de trials automatiques (structure prête, activation post-MVP).
- Pas de plan personnalisé "Enterprise" — vente directe manuelle, override dans DB par admin Excellence.

---

## 11. Structure ajoutée

```
/apps/web/src
  /lib
    /billing
      plans.ts                     # PLANS constant + types
      subscription.service.ts      # subscribe, change, cancel, renew
      quotas.service.ts            # assertQuota, incrementApiUsage
      dunning.service.ts           # process past_due, grace, downgrade
      geniuspay-excellence.client.ts
      saas-invoice-generator.ts    # génère PDF facture SaaS
    /middleware
      quota-tracker.ts             # incrémente api_calls_count
  /app/api/v1
    /billing/...
    /webhooks/geniuspay-excellence/route.ts
    /internal/cron
      /renew-subscriptions/route.ts
      /process-dunning/route.ts
      /reset-monthly-usage/route.ts

  /tests/integration
    /billing
      subscribe-flow.test.ts       # subscribe → webhook → active
      renewal-flow.test.ts         # cron → paid → next cycle
      dunning-flow.test.ts         # simulate J+0 → J+14 timeline
      downgrade-preserves-data.test.ts
      quota-enforcement.test.ts    # bloque création au-delà du quota
      quota-downgrade-retro.test.ts
      cross-tenant-billing.test.ts # webhook Excellence ne touche pas billing d'autre org
      race-condition-subscribe.test.ts
```

Ajout côté n8n :
```
/n8n/workflows
  email_saas_invoice_paid_v1.json
  email_saas_payment_failed_v1.json
  email_saas_dunning_reminder_v1.json
  email_saas_downgraded_v1.json
  cron_saas_renew_v1.json          # appelle /api/internal/cron/renew-subscriptions
  cron_saas_dunning_v1.json
  cron_saas_reset_monthly_v1.json
```

---

## 12. Definition of Done — Étape 6

- [ ] Les 3 plans définis, prix visibles sur endpoint public `/billing/plans`.
- [ ] Une org peut souscrire Pro → payer via GeniusPay checkout → subscription `active`.
- [ ] Facture SaaS PDF générée automatiquement, téléchargeable.
- [ ] Renouvellement testé sur cycle simulé : J-3 création cycle N+1, paiement → cycle actif, ancien cycle fermé.
- [ ] Dunning testé sur timeline J+0 → J+14 : email J+0, retry J+3, J+7, grace, downgrade J+14, aucune donnée perdue.
- [ ] Quotas : test explicite pour chaque quota du §3 (créer N+1 → 403).
- [ ] Downgrade Pro → Free ne perd aucune donnée ; banner d'alerte affiché.
- [ ] Idempotence webhook renewal : rejeu 10× → 1 seul cycle payé.
- [ ] Cross-tenant : webhook Excellence référençant `org_id` inexistant ou `attempt_id` d'une autre org → rejeté proprement.
- [ ] Race condition : 5 POST `/subscribe` simultanés → 1 cycle créé, 4 échouent proprement.
- [ ] Séparation stricte Excellence Merchant vs Org Merchant : test qui prouve qu'un webhook du merchant Excellence ne peut pas créditer une facture client (table `invoices` de l'Étape 3).
- [ ] Coverage ≥ 80%, lint clean.
- [ ] `docs/billing/plans.md`, `docs/billing/dunning.md`, `docs/billing/quota-enforcement.md`, `docs/billing/saas-invoice-legal.md` (revu par un comptable) à jour.

---

## 13. Livraison

Découpe en 3 PRs :
1. `feat/step6-plans-quotas` (PLANS constant, tables, quota enforcement, endpoints lecture)
2. `feat/step6-subscription-flow` (subscribe, cycles, GeniusPay Excellence, webhook)
3. `feat/step6-dunning-lifecycle` (renewal cron, dunning, grace, downgrade, cancel/reactivate + workflows n8n)

Review PR 2 et 3 : 2 relecteurs obligatoires (auth + billing critiques). Après merge : MVP monétisable, prêt pour lancement commercial.

---

## 14. Post-MVP — non prévu ici

Pour info seulement, à cadrer plus tard :
- Metered billing (facturation à l'usage au-delà des quotas)
- Facturation annuelle avec remise
- Coupons/promo codes
- Trial de 14j gratuits
- Stripe en plus de GeniusPay (marché international)
- Plans Enterprise personnalisés avec commercial dédié
- Facturation en USD/EUR pour clients hors UEMOA
- Portail de gestion des moyens de paiement (sauvegarde carte pour renouvellement transparent)