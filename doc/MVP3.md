# Étape 3 — Core Métier

**Dev assigné :** Dev 3
**Prérequis :** Étapes 1 et 2 mergées sur `main`.
**Durée estimée :** 10-14 jours (le plus gros bloc du MVP)
**Objectif :** Implémenter toute la chaîne de valeur commerciale — de la fiche client à l'avis client — en respectant l'auth unifiée (3 canaux) et l'isolation multi-tenant posées avant.

**Livrable final :** un back-end métier complet, testé, documenté, où un utilisateur peut piloter tout le cycle : créer un client → lancer un projet → émettre un devis → le faire signer → générer un contrat → le faire signer → facturer → suivre les dépenses → livrer → collecter un avis.

> ⚠️ **Prérequis obligatoire :** lire et appliquer [`standards-dev.md`](./standards-dev.md) — tests, docs, lint, TSDoc, PR template. La CI bloque tout merge non conforme.

---

## 1. Portée exacte de l'étape

### 1.1 Inclus
- 8 modules métier : clients, projets, devis, contrats, factures, dépenses, livrables, avis.
- **Module paiement GeniusPay** : encaissement des factures clients via mobile money / carte (voir §14).
- Machines à états (workflow) de chaque entité.
- Routes API `/api/v1/*` complètes pour les 3 canaux (session, api_key, public_token).
- Émission des événements webhook (`quote.sent`, `contract.signed`, `invoice.paid`, `project.delivered`, `review.created`, etc.) via le `emit()` de l'Étape 2.
- **Réception des webhooks GeniusPay** (`payment.success`, `payment.failed`, `payment.refunded`) pour réconciliation automatique des factures.
- Calculs de rentabilité par projet.
- Endpoints portail client (les routes existent en Étape 2, ici on branche la logique métier).

### 1.2 Exclus (autres étapes)
- Génération PDF réelle (Étape 4). Ici on stocke uniquement les métadonnées et un placeholder URL R2.
- Signature électronique visuelle/canvas (Étape 4). Ici on stocke la trace juridique (nom, email, IP, timestamp, hash du document).
- Envoi d'emails (Étape 5 via n8n). Ici on émet les événements, n8n consommera.
- UI SaaS (chaque module aura son écran plus tard — hors périmètre back).
- Billing/quotas Free/Pro/Business (étape ultérieure).

---

## 2. Schéma de base de données

**Règle absolue rappelée :** toutes les tables ci-dessous ont `organization_id uuid NOT NULL FK`, RLS activée, et sont accédées **exclusivement** via `tenantDb(orgId)` de l'Étape 1.

### 2.1 Clients

```
clients
  id                uuid PK
  organization_id   uuid FK → organizations(id) ON DELETE CASCADE
  type              text NOT NULL              (enum: 'individual' | 'company')
  display_name      text NOT NULL              (nom affiché, dérivé si company)
  company_name      text NULL
  first_name        text NULL
  last_name         text NULL
  email             citext NOT NULL
  phone             text NULL
  vat_number        text NULL                  (TVA/IFU)
  billing_address   jsonb NULL                 ({street, city, zip, country})
  shipping_address  jsonb NULL
  notes             text NULL
  tags              text[] DEFAULT '{}'
  is_archived       boolean DEFAULT false
  created_by        uuid FK → users(id)
  created_at        timestamptz DEFAULT now()
  updated_at        timestamptz DEFAULT now()
  deleted_at        timestamptz NULL

  UNIQUE(organization_id, email) WHERE deleted_at IS NULL
  INDEX idx_clients_org_created ON clients(organization_id, created_at DESC)
  INDEX idx_clients_search ON clients USING gin(to_tsvector('simple', display_name || ' ' || email))
```

### 2.2 Projets

```
projects
  id                uuid PK
  organization_id   uuid FK
  client_id         uuid FK → clients(id) ON DELETE RESTRICT
  code              text NOT NULL              (ex: "PRJ-2026-001", généré)
  name              text NOT NULL
  description       text NULL
  status            text NOT NULL              (enum: 'draft'|'active'|'on_hold'|'delivered'|'cancelled'|'archived')
  start_date        date NULL
  due_date          date NULL
  delivered_at      timestamptz NULL
  budget_cents      bigint NULL                (budget prévisionnel, en centimes)
  currency          text NOT NULL DEFAULT 'XOF' (ISO 4217)
  owner_user_id     uuid FK → users(id)        (chef de projet)
  created_by        uuid FK → users(id)
  created_at, updated_at, deleted_at

  UNIQUE(organization_id, code)
  INDEX idx_projects_org_status ON projects(organization_id, status)
  INDEX idx_projects_client ON projects(client_id)

project_members                                (équipe interne assignée)
  id                uuid PK
  organization_id   uuid FK
  project_id        uuid FK → projects(id) ON DELETE CASCADE
  user_id           uuid FK → users(id)
  role              text NOT NULL              (enum: 'lead'|'contributor'|'observer')
  added_at          timestamptz DEFAULT now()

  UNIQUE(project_id, user_id)
```

### 2.3 Devis

```
quotes
  id                uuid PK
  organization_id   uuid FK
  project_id        uuid FK → projects(id) ON DELETE RESTRICT
  client_id         uuid FK → clients(id) ON DELETE RESTRICT
  number            text NOT NULL              (ex: "DEV-2026-0042", séquence par org)
  status            text NOT NULL              (enum: 'draft'|'sent'|'viewed'|'accepted'|'rejected'|'expired'|'cancelled')
  currency          text NOT NULL DEFAULT 'XOF'
  subtotal_cents    bigint NOT NULL DEFAULT 0
  discount_cents    bigint NOT NULL DEFAULT 0
  tax_rate_bps      integer NOT NULL DEFAULT 0 (taux en basis points, ex: 1800 = 18%)
  tax_cents         bigint NOT NULL DEFAULT 0
  total_cents       bigint NOT NULL DEFAULT 0
  valid_until       date NULL
  notes             text NULL
  terms             text NULL                  (conditions particulières)
  pdf_r2_key        text NULL                  (rempli en Étape 4)
  sent_at           timestamptz NULL
  viewed_at         timestamptz NULL           (premier accès portail)
  accepted_at       timestamptz NULL
  accepted_by_name  text NULL                  (rempli si signature portail)
  accepted_by_email text NULL
  accepted_by_ip    inet NULL
  rejected_at       timestamptz NULL
  rejection_reason  text NULL
  created_by        uuid FK → users(id)
  created_at, updated_at, deleted_at

  UNIQUE(organization_id, number)
  INDEX idx_quotes_org_status ON quotes(organization_id, status, created_at DESC)
  INDEX idx_quotes_project ON quotes(project_id)

quote_items
  id                uuid PK
  organization_id   uuid FK                    (redondant mais impératif pour RLS)
  quote_id          uuid FK → quotes(id) ON DELETE CASCADE
  position          integer NOT NULL
  description       text NOT NULL
  quantity          numeric(12,3) NOT NULL DEFAULT 1
  unit              text NULL                  (ex: "jour", "unité", "h")
  unit_price_cents  bigint NOT NULL
  discount_bps      integer NOT NULL DEFAULT 0 (remise ligne, basis points)
  amount_cents      bigint NOT NULL            (qty * unit_price - discount, dénormalisé)

  INDEX idx_quoteitems_quote ON quote_items(quote_id, position)
```

### 2.4 Contrats

```
contracts
  id                uuid PK
  organization_id   uuid FK
  project_id        uuid FK → projects(id) ON DELETE RESTRICT
  client_id         uuid FK → clients(id) ON DELETE RESTRICT
  quote_id          uuid FK → quotes(id) NULL  (contrat issu d'un devis accepté)
  number            text NOT NULL              (ex: "CTR-2026-0018")
  title             text NOT NULL
  status            text NOT NULL              (enum: 'draft'|'sent'|'signed'|'cancelled'|'expired')
  body_markdown     text NOT NULL              (contenu contractuel — versionné plus tard)
  pdf_r2_key        text NULL                  (Étape 4)
  signed_pdf_r2_key text NULL                  (Étape 4, version avec cachet signature)
  sent_at           timestamptz NULL
  signed_at         timestamptz NULL
  signed_by_name    text NULL
  signed_by_email   text NULL
  signed_by_ip      inet NULL
  signature_hash    text NULL                  (sha256(pdf + signer_email + timestamp))
  expires_at        date NULL
  created_by        uuid FK → users(id)
  created_at, updated_at, deleted_at

  UNIQUE(organization_id, number)
  INDEX idx_contracts_org_status ON contracts(organization_id, status)
  INDEX idx_contracts_project ON contracts(project_id)
```

### 2.5 Factures

```
invoices
  id                uuid PK
  organization_id   uuid FK
  project_id        uuid FK → projects(id) NULL   (facture libre possible)
  client_id         uuid FK → clients(id) ON DELETE RESTRICT
  contract_id       uuid FK → contracts(id) NULL
  number            text NOT NULL              (ex: "FAC-2026-0107" — séquence STRICTE, jamais de trou)
  status            text NOT NULL              (enum: 'draft'|'sent'|'partial'|'paid'|'overdue'|'cancelled'|'refunded')
  currency          text NOT NULL DEFAULT 'XOF'
  subtotal_cents    bigint NOT NULL DEFAULT 0
  discount_cents    bigint NOT NULL DEFAULT 0
  tax_rate_bps      integer NOT NULL DEFAULT 0
  tax_cents         bigint NOT NULL DEFAULT 0
  total_cents       bigint NOT NULL DEFAULT 0
  amount_paid_cents bigint NOT NULL DEFAULT 0
  amount_due_cents  bigint GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED
  issue_date        date NOT NULL
  due_date          date NOT NULL
  paid_at           timestamptz NULL           (rempli quand amount_due = 0)
  pdf_r2_key        text NULL
  notes             text NULL
  created_by        uuid FK → users(id)
  created_at, updated_at, deleted_at

  UNIQUE(organization_id, number)
  INDEX idx_invoices_org_status ON invoices(organization_id, status, due_date)
  INDEX idx_invoices_client ON invoices(client_id)

invoice_items                                  (structure = quote_items)
  id, organization_id, invoice_id, position, description,
  quantity, unit, unit_price_cents, discount_bps, amount_cents

invoice_payments                               (multi-paiements possibles)
  id                  uuid PK
  organization_id     uuid FK
  invoice_id          uuid FK → invoices(id) ON DELETE RESTRICT
  amount_cents        bigint NOT NULL
  paid_at             timestamptz NOT NULL
  method              text NOT NULL            (enum: 'bank_transfer'|'mobile_money'|'card'|'cash'|'check'|'other')
  source              text NOT NULL            (enum: 'manual'|'geniuspay')  -- comment le paiement est arrivé
  payment_intent_id   uuid FK → payment_intents(id) NULL  -- si source=geniuspay
  gateway_reference   text NULL                (ex: MTX-A1B2C3D4E5, unique par gateway)
  gateway_fees_cents  bigint NULL              (frais GeniusPay retenus)
  net_amount_cents    bigint NULL              (montant crédité net des frais)
  reference           text NULL                (num transaction manuel)
  notes               text NULL
  recorded_by         uuid FK → users(id) NULL (null si automatique via webhook)
  created_at          timestamptz DEFAULT now()

  UNIQUE(organization_id, source, gateway_reference) WHERE gateway_reference IS NOT NULL  -- idempotence webhook
  INDEX idx_payments_invoice ON invoice_payments(invoice_id)
```

### 2.6 Dépenses

```
expenses
  id                uuid PK
  organization_id   uuid FK
  project_id        uuid FK → projects(id) ON DELETE RESTRICT
  category          text NOT NULL              (enum: 'salary'|'subcontractor'|'software'|'hardware'|'travel'|'marketing'|'other')
  description       text NOT NULL
  amount_cents      bigint NOT NULL
  currency          text NOT NULL DEFAULT 'XOF'
  incurred_on       date NOT NULL
  vendor            text NULL
  receipt_r2_key    text NULL                  (Étape 4, upload facultatif)
  billable          boolean DEFAULT false      (refacturable au client)
  reimbursed        boolean DEFAULT false
  created_by        uuid FK → users(id)
  created_at, updated_at, deleted_at

  INDEX idx_expenses_project_date ON expenses(project_id, incurred_on DESC)
  INDEX idx_expenses_org_category ON expenses(organization_id, category)
```

### 2.7 Livrables

```
deliverables
  id                uuid PK
  organization_id   uuid FK
  project_id        uuid FK → projects(id) ON DELETE CASCADE
  title             text NOT NULL
  description       text NULL
  status            text NOT NULL              (enum: 'draft'|'submitted'|'approved'|'rejected'|'revision_requested')
  file_r2_key       text NULL                  (Étape 4)
  file_name         text NULL
  file_size_bytes   bigint NULL
  file_mime         text NULL
  submitted_at      timestamptz NULL
  reviewed_at       timestamptz NULL
  reviewed_by_name  text NULL
  reviewed_by_email text NULL
  reviewed_by_ip    inet NULL
  rejection_reason  text NULL
  version           integer NOT NULL DEFAULT 1
  parent_id         uuid FK → deliverables(id) NULL  (chaîne de révisions)
  created_by        uuid FK → users(id)
  created_at, updated_at, deleted_at

  INDEX idx_deliverables_project ON deliverables(project_id, created_at DESC)
```

### 2.8 Avis clients

```
review_requests
  id                uuid PK
  organization_id   uuid FK
  project_id        uuid FK → projects(id) ON DELETE CASCADE
  client_id         uuid FK → clients(id) ON DELETE RESTRICT
  status            text NOT NULL              (enum: 'pending'|'submitted'|'expired')
  sent_at           timestamptz NULL
  expires_at        timestamptz NOT NULL
  created_by        uuid FK → users(id)
  created_at        timestamptz DEFAULT now()

  UNIQUE(project_id)                           (un seul avis par projet — MVP)

reviews
  id                uuid PK
  organization_id   uuid FK
  request_id        uuid FK → review_requests(id) ON DELETE CASCADE
  project_id        uuid FK → projects(id)
  client_id         uuid FK → clients(id)
  rating            smallint NOT NULL          (1 à 5)
  comment           text NULL
  submitted_at      timestamptz NOT NULL DEFAULT now()
  submitted_by_name text NOT NULL
  submitted_by_email text NOT NULL
  submitted_by_ip   inet NULL
  is_public         boolean DEFAULT false      (autorisation d'affichage vitrine)
  moderation_status text NOT NULL DEFAULT 'pending' (enum: 'pending'|'approved'|'rejected')

  CHECK (rating BETWEEN 1 AND 5)
  INDEX idx_reviews_org_rating ON reviews(organization_id, rating)
```

### 2.9 Séquences numériques (numéros de devis, contrats, factures, projets)

Table dédiée pour éviter les race conditions :

```
document_sequences
  id                uuid PK
  organization_id   uuid FK
  doc_type          text NOT NULL              (enum: 'quote'|'contract'|'invoice'|'project')
  year              integer NOT NULL
  last_number       integer NOT NULL DEFAULT 0

  UNIQUE(organization_id, doc_type, year)
```

Attribution d'un numéro = `UPDATE ... SET last_number = last_number + 1 RETURNING last_number` dans la même transaction que l'INSERT du document. Format : `<PREFIX>-<YEAR>-<NUMBER padded 4>`.

### 2.10 Paiement GeniusPay (multi-tenant : chaque org a ses propres clés)

```
payment_gateway_credentials
  id                    uuid PK
  organization_id       uuid FK → organizations(id) ON DELETE CASCADE
  provider              text NOT NULL          (enum: 'geniuspay' — seul provider MVP)
  environment           text NOT NULL          (enum: 'sandbox' | 'live')
  api_key_public        text NOT NULL          (pk_sandbox_xxx / pk_live_xxx, stocké en clair)
  api_secret_encrypted  bytea NOT NULL         (sk_..., chiffré AES-256-GCM avec KEK serveur)
  api_secret_nonce      bytea NOT NULL         (nonce AES-GCM 12 bytes)
  webhook_secret_encrypted bytea NOT NULL      (whsec_..., idem)
  webhook_secret_nonce  bytea NOT NULL
  merchant_id           text NULL              (retour de GET /account, cache pour debug)
  business_name         text NULL
  status                text NOT NULL          (enum: 'active' | 'disabled' | 'invalid_credentials')
  last_verified_at      timestamptz NULL       (dernier check via GET /account)
  created_by            uuid FK → users(id)
  created_at, updated_at

  UNIQUE(organization_id, provider, environment)   -- 1 clé sandbox + 1 clé live max par org

payment_intents                                 (intention de paiement créée AVANT redirect)
  id                    uuid PK
  organization_id       uuid FK
  invoice_id            uuid FK → invoices(id) ON DELETE RESTRICT
  provider              text NOT NULL DEFAULT 'geniuspay'
  environment           text NOT NULL          (sandbox | live)
  gateway_reference     text NULL              (MTX-... retourné par GeniusPay, null tant que pas créé)
  amount_cents          bigint NOT NULL        (montant demandé, doit correspondre à invoice.amount_due)
  currency              text NOT NULL          (XOF au MVP)
  checkout_url          text NULL              (URL hébergée GeniusPay)
  status                text NOT NULL          (enum: 'created'|'pending'|'processing'|'succeeded'|'failed'|'cancelled'|'expired')
  metadata              jsonb NOT NULL DEFAULT '{}'  (envoyé à GeniusPay, retourné dans webhook)
  gateway_status        text NULL              (dernier status GeniusPay reçu, pour debug)
  gateway_payment_method text NULL             (wave, orange_money, card...)
  gateway_fees_cents    bigint NULL
  gateway_net_cents     bigint NULL
  initiated_from_ip     inet NULL              (IP du client portail)
  succeeded_at          timestamptz NULL
  failed_at             timestamptz NULL
  failure_reason        text NULL
  expires_at            timestamptz NOT NULL   (défaut = now + 24h, aligné sur GeniusPay)
  created_at, updated_at

  UNIQUE(organization_id, provider, gateway_reference) WHERE gateway_reference IS NOT NULL
  INDEX idx_intents_invoice ON payment_intents(invoice_id)
  INDEX idx_intents_status ON payment_intents(organization_id, status)

payment_webhook_events                         (log immuable des webhooks entrants GeniusPay)
  id                    uuid PK
  organization_id       uuid FK NULL           (résolu via merchant → org, null si non résolu)
  provider              text NOT NULL DEFAULT 'geniuspay'
  event_id              text NOT NULL          (id UUID envoyé par GeniusPay)
  event_type            text NOT NULL          (payment.success, payment.failed, ...)
  environment           text NOT NULL
  raw_payload           jsonb NOT NULL         (payload complet, jamais modifié)
  signature_valid       boolean NOT NULL
  processed_at          timestamptz NULL       (null tant que non traité)
  processing_error      text NULL
  received_at           timestamptz DEFAULT now()
  received_from_ip      inet NULL

  UNIQUE(provider, event_id)                   -- idempotence : GeniusPay peut retry
  INDEX idx_wh_events_org_type ON payment_webhook_events(organization_id, event_type, received_at DESC)
```

**Chiffrement du secret (règle absolue)** : `api_secret_encrypted` et `webhook_secret_encrypted` sont chiffrés avec **AES-256-GCM**, clé KEK stockée dans `PAYMENT_CREDENTIALS_KEK` (env, jamais commitée, rotation prévue via re-chiffrement en batch). Le secret en clair ne transite qu'en RAM lors d'un appel GeniusPay et n'est **jamais loggé** (scrubber Sentry sur `sk_*` et `whsec_*`).

---

## 3. Machines à états (workflow)

Toute transition passe par un helper `transition(entity, from, to, actor)` qui :
1. Vérifie que la transition est autorisée (matrice ci-dessous).
2. Applique la mise à jour dans une transaction.
3. Écrit un audit log.
4. Émet l'événement webhook associé.

### 3.1 Devis

```
draft ──send──▶ sent ──view (portail)──▶ viewed ──accept──▶ accepted
                 │                          │
                 └──reject──▶ rejected      └──expire (cron)──▶ expired
                 └──cancel──▶ cancelled
```

- `accept` déclenche automatiquement la création (draft) d'un contrat lié (option activable par org, défaut on).

### 3.2 Contrat

```
draft ──send──▶ sent ──sign (portail)──▶ signed
                 │
                 └──cancel──▶ cancelled
                 └──expire──▶ expired
```

- `sign` (portail public) : passage à `signed`, remplit `signed_at`, `signed_by_*`, `signature_hash`.

### 3.3 Facture

```
draft ──send──▶ sent ──payment (partial)──▶ partial ──payment (full)──▶ paid
                 │                              │
                 │                              └──payment (full)──▶ paid
                 └──due_date passée + cron──▶ overdue
                 └──cancel──▶ cancelled
                 └──refund──▶ refunded
```

- L'ajout d'un `invoice_payment` recalcule `amount_paid_cents` et bascule automatiquement le statut.

### 3.4 Projet

```
draft ──activate──▶ active ──deliver──▶ delivered
                     │
                     ├──hold──▶ on_hold ──resume──▶ active
                     └──cancel──▶ cancelled
active/delivered ──archive──▶ archived
```

### 3.5 Livrable

```
draft ──submit──▶ submitted ──approve (portail)──▶ approved
                     │
                     ├──reject (portail)──▶ rejected
                     └──request_revision (portail)──▶ revision_requested
                        └──resubmit──▶ nouvelle version (nouveau row, parent_id lié)
```

### 3.6 Payment intent (GeniusPay)

```
created ──POST /payments GeniusPay OK──▶ pending
                                            │
                                            ├──webhook payment.success──▶ succeeded → crée invoice_payment
                                            ├──webhook payment.failed──▶ failed
                                            ├──webhook payment.cancelled──▶ cancelled
                                            ├──webhook payment.expired OU cron 24h──▶ expired
                                            └──webhook payment.refunded (après succeeded)──▶ succeeded reste, invoice_payment marqué refunded
```

**Règle d'or :** l'intent ne bascule à `succeeded` **qu'après vérification** du webhook ET re-fetch `GET /payments/{ref}` pour valider `amount` et `status` réels (jamais confiance aveugle au payload).

---

## 4. Règles de calcul (source de vérité)

### 4.1 Montants — arithmétique entière obligatoire

**Interdit : `number` JS pour tout montant.** Tous les montants sont en `bigint` (centimes). Les taux en basis points (`bps`, 1% = 100 bps).

```ts
// Ligne
lineAmount = quantity * unitPriceCents * (10000 - discountBps) / 10000

// Document
subtotal = Σ lineAmount
afterDiscount = subtotal - documentDiscount
tax = afterDiscount * taxRateBps / 10000
total = afterDiscount + tax
```

Arrondis : `Math.round` au centime le plus proche, à chaque étape, jamais cumulés. Doc obligatoire `docs/money.md` avec exemples et cas limites.

### 4.2 Rentabilité projet

```
project.revenue       = Σ invoices.total_cents (statut ∈ {sent, partial, paid})
project.collected     = Σ invoice_payments.amount_cents
project.expenses      = Σ expenses.amount_cents
project.gross_margin  = revenue - expenses
project.margin_pct    = gross_margin / revenue (si revenue > 0)
project.cash_position = collected - expenses
```

Endpoint dédié : `GET /api/v1/projects/:id/profitability` — calcul à la volée en Étape 3, cache matérialisé en étape ultérieure si besoin perf.

### 4.3 Multi-devise (MVP)

Une org a **une devise par défaut** (`organizations.default_currency` à ajouter). Chaque document a sa propre `currency`. Les agrégats projet **ne mélangent pas les devises** — si un projet a du XOF et de l'EUR, l'API renvoie un tableau par devise (pas de conversion automatique au MVP).

---

## 5. Routes API — inventaire complet

Toutes sous `/api/v1/`. Auth : session **ou** API key (scopes conformes à l'Étape 2). Portail = tokens publics.

### 5.1 Clients (scopes `clients:read` / `clients:write`)

```
GET    /clients                       (list, filters: search, tag, archived)
POST   /clients
GET    /clients/:id
PATCH  /clients/:id
DELETE /clients/:id                   (soft delete, refuse si projets actifs)
POST   /clients/:id/archive
POST   /clients/:id/unarchive
GET    /clients/:id/projects
GET    /clients/:id/invoices
```

### 5.2 Projets (`projects:read` / `projects:write`)

```
GET    /projects
POST   /projects
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
POST   /projects/:id/transition       { to: 'active' | 'on_hold' | ... }
GET    /projects/:id/members
POST   /projects/:id/members          { userId, role }
DELETE /projects/:id/members/:userId
GET    /projects/:id/profitability
```

### 5.3 Devis (`quotes:read` / `quotes:write`)

```
GET    /quotes
POST   /quotes                        (draft, avec items)
GET    /quotes/:id
PATCH  /quotes/:id                    (draft uniquement)
DELETE /quotes/:id                    (draft uniquement)
POST   /quotes/:id/send               → passe à 'sent', crée public_token, émet quote.sent
POST   /quotes/:id/cancel
POST   /quotes/:id/duplicate
GET    /quotes/:id/items
POST   /quotes/:id/items
PATCH  /quotes/:id/items/:itemId
DELETE /quotes/:id/items/:itemId
```

Portail :
```
GET  /portal/quotes/:id               (token: read → passe status à 'viewed' si première fois)
POST /portal/quotes/:id/accept        (token: sign, body: {signerName, signerEmail}) → 'accepted' + émet quote.accepted
POST /portal/quotes/:id/reject        (token: sign, body: {reason})
```

### 5.4 Contrats (`contracts:read` / `contracts:write`)

```
GET    /contracts
POST   /contracts                     (peut inclure quoteId pour pré-remplir)
GET    /contracts/:id
PATCH  /contracts/:id                 (draft uniquement)
POST   /contracts/:id/send            → 'sent', crée public_token, émet contract.sent
POST   /contracts/:id/cancel
```

Portail :
```
GET  /portal/contracts/:id
POST /portal/contracts/:id/sign       (token: sign, body: {signerName, signerEmail, signatureBase64}) → 'signed' + émet contract.signed
```

### 5.5 Factures (`invoices:read` / `invoices:write`)

```
GET    /invoices
POST   /invoices                      (peut inclure contractId ou projectId)
GET    /invoices/:id
PATCH  /invoices/:id                  (draft uniquement)
POST   /invoices/:id/send             → 'sent', crée public_token read, émet invoice.created
POST   /invoices/:id/cancel
POST   /invoices/:id/refund
GET    /invoices/:id/payments
POST   /invoices/:id/payments         { amountCents, paidAt, method, reference } → recalcul statut, émet invoice.paid si soldée
DELETE /invoices/:id/payments/:paymentId
```

Portail :
```
GET  /portal/invoices/:id             (token: read)
```

### 5.6 Dépenses (`expenses:read` / `expenses:write`)

```
GET    /expenses                      (filters: projectId, category, dateRange)
POST   /expenses
GET    /expenses/:id
PATCH  /expenses/:id
DELETE /expenses/:id
GET    /projects/:id/expenses         (raccourci)
```

### 5.7 Livrables (`deliverables:read` / `deliverables:write`)

```
GET    /projects/:id/deliverables
POST   /projects/:id/deliverables     (crée en draft)
GET    /deliverables/:id
PATCH  /deliverables/:id              (draft uniquement)
POST   /deliverables/:id/submit       → 'submitted', crée public_token, émet deliverable.submitted
POST   /deliverables/:id/resubmit     (crée v+1 avec parent_id)
```

Portail :
```
GET  /portal/deliverables/:id
POST /portal/deliverables/:id/approve (token: approve) → 'approved' + émet deliverable.approved
POST /portal/deliverables/:id/reject  (token: reject, body: {reason}) → 'rejected'
POST /portal/deliverables/:id/request_revision (token: reject variant) → 'revision_requested'
```

### 5.8 Avis (`reviews:read` / `reviews:write`)

```
POST   /projects/:id/review-request   → crée review_request + public_token, émet review.requested
GET    /reviews                       (filters: rating, moderation_status)
GET    /reviews/:id
PATCH  /reviews/:id                   (uniquement moderation_status, is_public — admin+)
```

Portail :
```
GET  /portal/reviews/:requestId
POST /portal/reviews/:requestId       (token: submit_review, body: {rating, comment, submitterName, submitterEmail}) → émet review.created
```

### 5.9 Paiement — GeniusPay (nouveau)

**Gestion des credentials (session, `owner` ou `admin`)** :
```
POST   /payment-gateways/geniuspay                      { environment, apiKeyPublic, apiSecret, webhookSecret }
                                                        → vérifie via GET /account, chiffre, stocke
GET    /payment-gateways                                → liste (sans secrets, avec statut, last_verified_at)
POST   /payment-gateways/:id/verify                     → re-check via GET /account
DELETE /payment-gateways/:id                            → soft delete + désactivation
```

**Initiation paiement (portail, token action `read` sur invoice)** :
```
POST /portal/invoices/:id/pay        { returnUrl?, cancelUrl? }
     → crée payment_intent (status=created)
     → appelle GeniusPay POST /payments (mode checkout, sans payment_method)
       body: { amount, currency: 'XOF', description: 'Facture <number>',
               customer: { name, email, phone } (dérivé du client),
               success_url, error_url,
               metadata: { invoice_id, org_id, intent_id } }
     → stocke gateway_reference + checkout_url, status → pending
     → retourne { checkoutUrl } au portail
```

**Consultation intent (portail)** :
```
GET /portal/invoices/:id/payment-intents/:intentId
     → status courant + re-fetch GET /payments/{ref} si pending depuis >2min (fallback si webhook perdu)
```

**Webhook GeniusPay entrant (endpoint PUBLIC, pas d'auth session/api_key/token)** :
```
POST /api/v1/webhooks/geniuspay
     Headers requis :
       X-Webhook-Signature: <HMAC-SHA256>
       X-Webhook-Timestamp: <unix>
       X-Webhook-Event: <event.type>
       X-Webhook-Environment: sandbox | live
```

Handler pipeline (obligatoire, ordre strict) :
1. **Insertion immédiate** dans `payment_webhook_events` avec `signature_valid=null` (log avant toute décision).
2. **Rejet timestamp** si `|now - timestamp| > 300s` → 400 + `signature_valid=false`.
3. **Résolution org** via `metadata.org_id` (ou via `merchant_id` en fallback). Si non trouvée → 200 (acquittement) + `processing_error='org_not_found'`.
4. **Récupération credentials** de l'org pour l'environnement correspondant, déchiffrement `webhook_secret`.
5. **Vérification HMAC** en constant-time. Invalide → 401 + `signature_valid=false`.
6. **Détection replay** : si `event_id` déjà présent dans `payment_webhook_events` → 200 (acquittement idempotent) + `processing_error='duplicate'`.
7. **Re-fetch GeniusPay** `GET /payments/{reference}` avec les clés de l'org pour valider `amount` et `status` réels. Divergence → 200 + `processing_error='amount_mismatch'` + alerte critique.
8. **Application métier** dans une transaction :
   - `payment.success` → intent.succeeded + création `invoice_payment` (source=geniuspay) + recalcul statut facture + emit `invoice.paid` si soldée.
   - `payment.failed` / `payment.cancelled` / `payment.expired` → intent → statut correspondant.
   - `payment.refunded` → création `invoice_payment` négatif OU marquage refund (règle métier à figer, voir §14.5).
9. `processed_at = now()`, retour 200.

**Toujours 200 après acquittement** (sauf signature invalide ou timestamp expiré), même si l'événement est ignoré : GeniusPay retry sinon.

---

## 6. Événements webhook émis

À chaque transition d'état, `emit(event, orgId, payload)` :

| Événement | Déclencheur | Payload principal |
|---|---|---|
| `client.created` | POST /clients | `{ client }` |
| `client.updated` | PATCH /clients/:id | `{ client, changed[] }` |
| `project.created` | POST /projects | `{ project }` |
| `project.status_changed` | transition | `{ project, from, to }` |
| `project.delivered` | transition → delivered | `{ project }` |
| `quote.sent` | POST /quotes/:id/send | `{ quote, portalUrl }` |
| `quote.viewed` | portail GET (première fois) | `{ quote }` |
| `quote.accepted` | portail accept | `{ quote, signer }` |
| `quote.rejected` | portail reject | `{ quote, reason }` |
| `contract.sent` | send | `{ contract, portalUrl }` |
| `contract.signed` | portail sign | `{ contract, signer, signatureHash }` |
| `invoice.created` | POST /invoices | `{ invoice }` |
| `invoice.sent` | send | `{ invoice, portalUrl }` |
| `invoice.paid` | dernier paiement (manuel OU GeniusPay) | `{ invoice, totalPaid }` |
| `invoice.overdue` | cron (daily) | `{ invoice, daysOverdue }` |
| `invoice.payment_initiated` | POST /portal/invoices/:id/pay | `{ invoice, intent, checkoutUrl }` |
| `invoice.payment_failed` | webhook GeniusPay failed | `{ invoice, intent, reason }` |
| `invoice.payment_refunded` | webhook GeniusPay refunded | `{ invoice, payment, amount }` |
| `deliverable.submitted` | submit | `{ deliverable, portalUrl }` |
| `deliverable.approved` | portail approve | `{ deliverable, reviewer }` |
| `deliverable.rejected` | portail reject | `{ deliverable, reason }` |
| `review.requested` | POST /review-request | `{ request, portalUrl }` |
| `review.created` | portail submit | `{ review }` |

Le payload complet suit le format Étape 2 §6.2.

---

## 7. Règles d'intégrité & garde-fous

- **Un devis `accepted` ne peut plus être modifié** — seulement `cancel` (rare) ou création d'un nouveau devis.
- **Une facture `sent` ne peut plus voir ses items modifiés.** Correction = avoir/annulation + nouvelle facture.
- **Suppression d'un client refusée** s'il a des projets actifs ou des factures non soldées.
- **Suppression d'un projet refusée** s'il a des factures `sent`/`paid` (soft delete uniquement autorisé sur brouillons).
- **Numérotation stricte** : jamais de trou dans la séquence des factures (obligation fiscale dans beaucoup de juridictions). Une facture annulée garde son numéro et passe en `cancelled`.
- **Signature portail** : la vérification `token.recipient_email === body.signerEmail` reste obligatoire (Étape 2 §3.5).
- **Émission d'un événement** doit toujours être dans la même transaction que la mutation d'état (via un pattern outbox : ligne dans `webhook_deliveries` créée en même temps).

---

## 8. Cron jobs (posés ici, exécutés par n8n en Étape 5)

Endpoints internes protégés par un secret CRON_SECRET (header `X-Cron-Secret`) :

```
POST /api/internal/cron/expire-quotes           (toutes les heures)
POST /api/internal/cron/mark-invoices-overdue   (quotidien)
POST /api/internal/cron/expire-review-requests  (quotidien)
POST /api/internal/cron/expire-public-tokens    (quotidien, purge des tokens périmés)
```

En Étape 3 : implémenter la logique. En Étape 5 : n8n déclenche.

---

## 9. Sécurité — additions Étape 3

- [ ] Aucune requête métier ne bypass `tenantDb`. Grep CI qui interdit `db.select().from(clients|projects|quotes|...)` en dehors des repositories.
- [ ] RLS activée sur **toutes** les nouvelles tables + policies testées.
- [ ] Injection : tous les filtres API validés par whitelist Zod (jamais de champ arbitraire passé à Drizzle).
- [ ] Enum de statut validés Zod côté API + CHECK constraint en DB.
- [ ] Numérotation : la mise à jour de `document_sequences` doit utiliser `SELECT ... FOR UPDATE` ou `UPDATE ... RETURNING` en transaction pour éviter les doublons.
- [ ] Signature contrat : `signature_hash = sha256(pdf_bytes || signer_email || iso_timestamp)`. Stocké et vérifiable.
- [ ] IP & user-agent de toutes les actions portail loggés (Étape 1 audit_logs).
- [ ] Actions portail sensibles (accept, sign, approve, reject) : rate limit 3/h/token (Étape 2 §7).
- [ ] Endpoint de rentabilité : accessible uniquement à `owner`/`admin`/`member` — pas aux `viewer`.
- [ ] Emails clients : jamais renvoyés dans les webhooks des orgs tierces (chacun ne voit que ses propres données).
- [ ] Uploads (livrables, reçus) : refusés à cette étape avec un `501 NOT_IMPLEMENTED_YET` clair (activation Étape 4).

**Sécurité paiement GeniusPay (bloquant) :**
- [ ] `PAYMENT_CREDENTIALS_KEK` en env, jamais commitée, longueur 32 bytes, rotation documentée.
- [ ] Secrets GeniusPay (`sk_*`, `whsec_*`) **jamais** en clair en DB, jamais loggés, jamais renvoyés dans une réponse API (même à l'org propriétaire — au max on affiche les 4 derniers chars).
- [ ] Scrubber logs et Sentry : regex `sk_(live|sandbox)_[a-zA-Z0-9]+` et `whsec_[a-zA-Z0-9]+` → `REDACTED`.
- [ ] Vérification HMAC en `crypto.timingSafeEqual`, jamais `===`.
- [ ] Rejet timestamp > 300s systématique.
- [ ] Idempotence webhook via `UNIQUE(provider, event_id)` en DB, pas de logique applicative fragile.
- [ ] Re-fetch GeniusPay obligatoire avant marquage `succeeded` (défense contre payload forgé même si signature valide — cas clé compromise).
- [ ] Endpoint `/api/v1/webhooks/geniuspay` **hors CSRF**, hors rate limit standard (mais rate limit dédié : 500/min/IP), hors middleware d'auth.
- [ ] Validation stricte : `payment_intent.amount` DOIT égaler `invoice.amount_due` au moment de la création. Refus 409 si écart.
- [ ] Aucun paiement portail sans public_token valide + credentials GeniusPay actives pour l'org.
- [ ] Aucune fuite cross-org : un webhook signé par les clés de l'org A ne peut jamais mettre à jour une facture de l'org B (vérification `intent.organization_id == webhook.resolved_org`).
- [ ] Payload webhook **immuable** en DB (`payment_webhook_events.raw_payload`, colonne write-once, révocation UPDATE au niveau DB).
- [ ] Audit log : `payment_gateway.credentials_added`, `payment_gateway.credentials_updated`, `payment_gateway.credentials_deleted`, `payment.intent_created`, `payment.succeeded`, `payment.failed`, `payment.refunded`, `payment.webhook_rejected`.

---

## 10. Ce que Dev 3 ne fait PAS

- Pas de génération PDF (Étape 4) — `pdf_r2_key` reste NULL, l'API renvoie `pdfStatus: 'pending'`.
- Pas d'upload de fichiers (livrables, reçus dépenses) — retour `501` propre.
- Pas de rendu signature manuscrite — juste stockage des métadonnées.
- Pas d'envoi d'email (Étape 5).
- Pas d'UI SaaS.
- **Pas de billing SaaS (plans Free/Pro/Business, abonnements, quotas)** — c'est l'Étape 6. GeniusPay est utilisé ici **uniquement pour encaisser les factures des clients des orgs**, pas les abonnements Excellence.
- Pas d'autres providers de paiement que GeniusPay (Stripe, PayPal, etc. — hors scope).
- Pas de cash-out / retraits vers l'org (Étape 6 ou ultérieure).
- Pas de conversion multi-devise.

---

## 11. Structure de code

```
/apps/web/src
  /lib
    /repositories                # accès DB via tenantDb (jamais db brut)
      clients.repo.ts
      projects.repo.ts
      quotes.repo.ts
      contracts.repo.ts
      invoices.repo.ts
      expenses.repo.ts
      deliverables.repo.ts
      reviews.repo.ts
      sequences.repo.ts
    /services                    # logique métier (transitions, calculs)
      quotes.service.ts
      contracts.service.ts
      invoices.service.ts
      profitability.service.ts
      money.ts                   # arithmétique montants
    /payments
      geniuspay.client.ts        # wrapper HTTP GeniusPay (createPayment, getPayment, getAccount)
      credentials.service.ts     # chiffrement AES-GCM + verify
      intents.service.ts         # création + suivi payment_intent
      webhook-handler.ts         # pipeline 9 étapes du §5.9
      hmac.ts                    # constant-time verify
    /workflows                   # state machines déclaratives
      quote.state.ts
      contract.state.ts
      invoice.state.ts
      project.state.ts
      deliverable.state.ts
  /app/api/v1
    /clients/...
    /projects/...
    /quotes/...
    /contracts/...
    /invoices/...
    /expenses/...
    /deliverables/...
    /reviews/...
    /portal
      /quotes/...
      /contracts/...
      /invoices/...
        /[id]/pay/route.ts       # POST → crée intent GeniusPay
        /[id]/payment-intents/[intentId]/route.ts
      /deliverables/...
      /reviews/...
    /payment-gateways/...
    /webhooks/geniuspay/route.ts # endpoint public HMAC-signé
    /internal/cron/...
  /tests
    /integration
      clients.test.ts
      quote-to-invoice-flow.test.ts    # test end-to-end du cycle complet
      portal-signature.test.ts
      profitability.test.ts
      money.test.ts                    # cas limites arrondis
      tenant-isolation.test.ts         # étendu aux 8 nouvelles tables + payment
      payments/
        credentials-encryption.test.ts # AES-GCM roundtrip + KEK rotation
        geniuspay-client.test.ts       # avec MSW pour mocker GeniusPay
        webhook-hmac.test.ts           # vecteurs valides/invalides/replay
        webhook-idempotency.test.ts    # même event_id x10 → 1 seul paiement créé
        webhook-cross-tenant.test.ts   # webhook org A ne touche pas facture org B
        amount-mismatch.test.ts        # payload amount ≠ invoice → refus
        pay-invoice-flow.test.ts       # end-to-end : portail → intent → webhook → paid
```

---

## 12. Definition of Done — Étape 3

- [ ] Les 8 modules ont leur schéma, migrations up/down, repositories, services, routes API.
- [ ] Toutes les transitions d'état passent par `transition()` avec audit + emit.
- [ ] Test end-to-end : créer client → projet → devis → send → accept (portail) → contrat (auto) → send → sign (portail) → facture → paiement → livrable → approve (portail) → review request → review submit. **Ce test doit passer en CI.**
- [ ] Test d'isolation multi-tenant étendu aux 8 tables + 3 tables paiement (via session, api_key, public_token).
- [ ] Test des scopes API : une key sans `invoices:write` ne peut pas POST /invoices.
- [ ] Test rentabilité : projet avec 2 factures + 3 dépenses → chiffres justes au centime.
- [ ] Test montants : cas limites arrondis (remise 33.33%, TVA 5.5%, etc.) — pas d'écart d'1 centime.
- [ ] Test séquences : 100 factures créées en parallèle → 100 numéros uniques, pas de trou.
- [ ] Cron endpoints répondent 200 avec le bon `X-Cron-Secret`, 401 sinon.
- [ ] **Test paiement E2E** (avec GeniusPay mocké via MSW) : org configure clés → facture envoyée → portail POST /pay → GeniusPay retourne checkout_url → simulation webhook `payment.success` signé → invoice bascule `paid` → `invoice.paid` émis.
- [ ] **Test HMAC** : vecteur de signature valide passe, signature altérée d'1 bit rejetée, timestamp > 5min rejeté.
- [ ] **Test replay** : même `event_id` envoyé 10× en parallèle → 1 seul `invoice_payment` créé (idempotence DB).
- [ ] **Test cross-tenant paiement** : webhook signé avec clés org A référençant `intent_id` d'org B → rejeté avec `processing_error='cross_tenant'`, aucune mutation.
- [ ] **Test montant divergent** : webhook `amount=10000` mais `GET /payments/{ref}` retourne `amount=1000` → rejeté, alerte critique loggée, facture non marquée payée.
- [ ] **Test chiffrement credentials** : roundtrip encrypt/decrypt OK, KEK rotation testée (re-chiffrement en batch), secrets absents de tous les logs de test.
- [ ] OpenAPI mis à jour, `docs/CHANGELOG-API.md` complet, quickstart intégrateur revu.
- [ ] Documentation métier : `docs/workflows.md` (diagrammes états), `docs/money.md`, `docs/profitability.md`.
- [ ] Coverage ≥ 80%, lint + tsc clean, zéro `any`.
- [ ] Tous les événements webhook émis correctement (visibles dans `webhook_deliveries`).

---

## 13. Livraison

- Cette étape est grosse : **découper en 4 PRs successives** sur `feat/step3-core` :
  1. `feat/step3-clients-projects` (fondations + rentabilité stub)
  2. `feat/step3-quotes-contracts` (workflow devis → contrat, signature portail)
  3. `feat/step3-invoices-expenses-deliverables-reviews` (facturation, dépenses, livrables, avis)
  4. `feat/step3-payments-geniuspay` (§14 : credentials, intents, webhook — après que factures fonctionnent)
- Chaque PR : review par toi + un autre dev (Dev 2 idéalement pour valider la cohérence avec l'auth). PR 4 : review obligatoire à 2 personnes (auth + montants critiques).
- Après merge complet : Devs 4 et 5 peuvent démarrer PDF/R2 et n8n en parallèle sur ce socle stable.

---

## 14. Récapitulatif — Module Paiement GeniusPay

**Modèle retenu (par défaut, révisable en revue) :** chaque org configure **ses propres clés GeniusPay** (multi-tenant credentials). Les paiements des factures clients arrivent **directement sur le compte marchand de l'org**, Excellence ne fait qu'orchestrer. Zéro flux d'argent transite par Excellence → pas de contrainte de money transmitter, complexité minimale au MVP.

### 14.1 Périmètre couvert dans cette étape
- Configuration des credentials GeniusPay par org (sandbox + live séparés).
- Chiffrement AES-256-GCM des secrets `sk_*` et `whsec_*` (KEK serveur).
- Route portail `POST /portal/invoices/:id/pay` : crée un `payment_intent`, appelle GeniusPay en mode **checkout hébergé** (sans `payment_method`, GeniusPay génère la page), retourne `checkoutUrl`.
- Endpoint public `POST /api/v1/webhooks/geniuspay` avec pipeline 9 étapes (log → timestamp → org → HMAC → replay → re-fetch → mutation → ack).
- Réconciliation automatique : `payment.success` → `invoice_payment` créé, statut facture recalculé, événement `invoice.paid` émis pour les webhooks sortants (n8n en Étape 5 enverra l'email de confirmation).
- Idempotence stricte via `UNIQUE(provider, event_id)`.
- Vérification défensive : re-fetch `GET /payments/{ref}` avant toute mutation (protège contre payload forgé / clé compromise).

### 14.2 Périmètre hors étape (renvoyé plus tard)
- Billing SaaS Excellence (plans Free/Pro/Business, abonnements récurrents) → **Étape 6**.
- Autres gateways (Stripe, PayPal) → post-MVP, l'abstraction `provider` en table est déjà là.
- Retraits / cashout depuis GeniusPay → géré par l'org directement sur son dashboard GeniusPay, hors scope.
- Facturation partielle via GeniusPay (paiement en plusieurs fois) → V2, MVP = paiement du solde total uniquement.

### 14.3 Devise
XOF au MVP (couvre Bénin + Côte d'Ivoire natif). Multi-devise renvoyé à plus tard, mais la colonne `currency` est présente dès maintenant sur `invoices` et `payment_intents`.

### 14.4 Points de vigilance à surveiller en revue
- **KEK loss = perte totale des credentials** de toutes les orgs. Backup chiffré séparé + procédure de rotation documentée obligatoires avant prod.
- **Rejeu webhook** : GeniusPay peut rejouer, notre `UNIQUE(event_id)` protège en DB, mais tester en charge (100 rejeux simultanés).
- **Cas "paid manuel + webhook succès arrive après"** : la facture est déjà payée en cash, puis le client paie aussi via GeniusPay. Détecter le sur-paiement, émettre `invoice.overpaid`, ne pas rembourser automatiquement (décision humaine).
- **Cas failure du re-fetch** (GeniusPay down au moment du webhook) : retry le webhook via file (5 tentatives, backoff), ne jamais marquer succeeded sans re-fetch réussi.
- **Perte de webhook** : le portail poll `GET /portal/invoices/:id/payment-intents/:intentId` toutes les 3s après retour du checkout, avec re-fetch GeniusPay si `pending > 2min`.

### 14.5 Cas remboursement — DÉCISION FIGÉE : Option A

`payment.refunded` (webhook GeniusPay) → création d'un nouveau `invoice_payment` avec `amount_cents < 0` (montant négatif), `source='geniuspay'`, `gateway_reference` = ref du refund GeniusPay. Le trigger de recalcul du statut facture :
- Si `Σ payments == 0` → facture repasse `refunded`.
- Si `Σ payments > 0` (remboursement partiel) → facture reste `paid` avec `amount_due` recalculé.

Émission de l'événement webhook sortant `invoice.payment_refunded` avec `{ invoice, refundedAmount, remainingPaid }`.

Test obligatoire : paiement 15000 → remboursement partiel 5000 → facture reste `paid` avec `amount_due=5000`. Puis remboursement final 10000 → facture `refunded`, `Σ payments = 0`.

### 14.6 Doc obligatoire livrée par Dev 3
- `docs/payments/geniuspay-integration.md` — flow complet + diagramme séquence portail/GeniusPay/webhook.
- `docs/payments/credentials-security.md` — chiffrement, KEK, rotation, procédure incident (fuite secret).
- `docs/payments/webhook-troubleshooting.md` — comment rejouer un webhook, comment vérifier une signature, checklist debug.