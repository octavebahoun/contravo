# Étape 2 — API publique, API Keys & Tokens Portail Client

**Dev assigné :** Dev 2
**Prérequis :** Étape 1 mergée sur `main`.
**Durée estimée :** 5-7 jours
**Objectif :** Ouvrir la plateforme à trois publics distincts (utilisateurs internes déjà couverts, intégrateurs API, clients externes du portail) avec **trois mécanismes d'auth étanches** partageant le même moteur RBAC et la même isolation `organization_id`.

**Livrable final :** un contrat d'API stable (`/api/v1/*`) authentifiable par API key ET par token public, versionnable, rate-limité, documenté OpenAPI, et sur lequel les Devs 3-4-5 peuvent brancher leurs modules métier sans jamais retoucher l'auth.

> ⚠️ **Prérequis obligatoire :** lire et appliquer [`standards-dev.md`](./standards-dev.md) — tests, docs, lint, TSDoc, PR template. La CI bloque tout merge non conforme.

---

## 1. Les trois canaux d'authentification

| Canal | Qui | Comment | Scope | Étape |
|---|---|---|---|---|
| **Session cookie** | Users internes (SaaS) | Cookie `session=` httpOnly | Toutes les orgs de l'user, RBAC via `memberships.role` | Étape 1 ✅ |
| **API key** | Intégrateurs, systèmes tiers | Header `Authorization: Bearer sk_live_...` | Une seule org, scopes granulaires | **Étape 2** |
| **Public token** | Clients externes (portail) | URL magique `?token=pt_...` ou header | Une seule ressource (devis X, contrat Y), lecture ± action unique | **Étape 2** |

**Règle d'or :** les trois canaux produisent le **même `RequestContext`** défini en Étape 1 (`user`, `organization`, `db` tenant-scopée, `audit`). Le middleware détecte le canal, résout l'identité, et livre un contexte uniforme. Les routes métier ne savent jamais d'où vient l'appel — elles vérifient uniquement les **permissions**.

---

## 2. API Keys — spécification

### 2.1 Table

```
api_keys
  id                uuid PK
  organization_id   uuid FK → organizations(id) ON DELETE CASCADE
  name              text NOT NULL              (ex: "n8n prod", "Zapier staging")
  prefix            text NOT NULL              (ex: "sk_live_a3f9" — 12 chars, indexé)
  key_hash          text UNIQUE NOT NULL       (sha256 du secret complet)
  scopes            text[] NOT NULL            (ex: ['clients:read', 'invoices:write'])
  created_by        uuid FK → users(id)
  last_used_at      timestamptz NULL
  last_used_ip      inet NULL
  expires_at        timestamptz NULL           (rotation forcée possible)
  revoked_at        timestamptz NULL
  created_at        timestamptz DEFAULT now()

  INDEX idx_apikeys_org ON api_keys(organization_id)
  INDEX idx_apikeys_prefix ON api_keys(prefix)
```

### 2.2 Format du secret

```
sk_live_<32 bytes base62>   → prod
sk_test_<32 bytes base62>   → sandbox / staging
```

- **Prefix** (`sk_live_a3f9`) = les 12 premiers chars, stockés en clair pour l'affichage et la recherche.
- **Secret complet** montré **une seule fois** à la création, jamais re-consultable.
- **Stockage** : `sha256(secret_complet)` uniquement. Pas de bcrypt/argon2 ici : c'est un secret 256-bit, un hash rapide suffit et évite la latence sur chaque requête.

### 2.3 Scopes

Format `<resource>:<action>` — figés dès maintenant même si les ressources n'existent pas encore :

```ts
export const API_SCOPES = [
  'clients:read', 'clients:write',
  'projects:read', 'projects:write',
  'quotes:read', 'quotes:write',
  'contracts:read', 'contracts:write',
  'invoices:read', 'invoices:write',
  'expenses:read', 'expenses:write',
  'deliverables:read', 'deliverables:write',
  'reviews:read', 'reviews:write',
  'webhooks:manage',
  '*'  // super-key, création restreinte aux owners uniquement
] as const;
```

- Une API key qui appelle une route sans le scope requis → **403 `INSUFFICIENT_SCOPE`**.
- Le scope `*` requiert une double confirmation à la création (re-saisie password) et est loggé en `audit_logs` avec severity `high`.

### 2.4 Routes de gestion

```
POST   /api/v1/api-keys              { name, scopes[], expiresAt? }  → renvoie secret UNE fois
GET    /api/v1/api-keys              → liste (sans secret, avec prefix + last_used)
DELETE /api/v1/api-keys/:id          → révocation (soft: set revoked_at)
POST   /api/v1/api-keys/:id/rotate   → génère nouveau secret, ancien valide 24h (grace period)
```

Permissions : uniquement `owner` et `admin` (défini dans `PERMISSIONS` étendu).

### 2.5 Vérification à chaque requête

```
1. Extraire header Authorization: Bearer sk_live_xxx
2. Split → prefix (12 chars) + secret
3. SELECT api_keys WHERE prefix = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
4. Comparer sha256(secret) avec key_hash en constant-time (crypto.timingSafeEqual)
5. UPDATE last_used_at, last_used_ip (async, ne bloque pas la réponse)
6. Attacher contexte { organization, scopes, apiKeyId }
```

**Aucun `user` dans le contexte** quand l'appel vient d'une API key. Les routes doivent gérer ce cas (voir §5).

---

## 3. Public Tokens — spécification

Objectif : un client (personne externe, pas d'user account) reçoit un email avec un lien type
`https://app.excellence.app/p/quotes/q_123?token=pt_a3f9b8...`
et peut consulter le devis, le signer, valider un livrable, laisser un avis — **sans jamais créer de compte**.

### 3.1 Table

```
public_tokens
  id                uuid PK
  organization_id   uuid FK → organizations(id) ON DELETE CASCADE
  resource_type     text NOT NULL              (enum: 'quote'|'contract'|'invoice'|'deliverable'|'review_request')
  resource_id       uuid NOT NULL
  token_hash        text UNIQUE NOT NULL       (sha256)
  actions           text[] NOT NULL            (ex: ['read', 'sign'], ['read', 'approve'], ['read', 'submit_review'])
  recipient_email   text NOT NULL              (email attendu, à confirmer avant action sensible)
  expires_at        timestamptz NOT NULL       (défaut 30j lecture, 7j signature)
  max_uses          integer NULL               (null = illimité en lecture, 1 pour signature)
  used_count        integer DEFAULT 0
  first_used_at     timestamptz NULL
  last_used_at      timestamptz NULL
  last_used_ip      inet NULL
  revoked_at        timestamptz NULL
  created_by        uuid FK → users(id)
  created_at        timestamptz DEFAULT now()

  INDEX idx_ptokens_resource ON public_tokens(resource_type, resource_id)
  INDEX idx_ptokens_org ON public_tokens(organization_id)
```

### 3.2 Format

```
pt_<40 bytes base62>
```

- Pas de préfixe live/test — l'environnement se déduit du domaine.
- Stocké uniquement en `sha256(token)`.
- Le token complet est envoyé **une seule fois** dans l'email initial. S'il est perdu, on en régénère un nouveau (l'ancien reste valide jusqu'à expiration sauf révocation explicite).

### 3.3 Actions par ressource (figées)

| Resource | Actions autorisées | Expiration défaut | max_uses |
|---|---|---|---|
| `quote` | `read`, `sign` (= accepter) | 30j / 7j sign | sign: 1 |
| `contract` | `read`, `sign` | 30j / 7j sign | sign: 1 |
| `invoice` | `read` | 90j | ∞ |
| `deliverable` | `read`, `approve`, `reject` | 30j | approve/reject: 1 |
| `review_request` | `read`, `submit_review` | 60j | submit: 1 |

### 3.4 Résolution du token

```
1. Lire ?token= (query) ou header X-Public-Token
2. sha256 → SELECT public_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > now()
3. Vérifier used_count < max_uses (si max_uses défini)
4. Vérifier resource_type et resource_id correspondent à l'URL demandée
5. Attacher contexte { organization, resourceType, resourceId, actions, tokenId }
6. Pour actions autres que 'read' : incrémenter used_count en transaction avec l'action
```

**Contexte spécifique portail :** ni `user` ni `role`. Les routes portail vérifient uniquement `token.actions.includes(actionDemandée)`.

### 3.5 Confirmation d'identité pour actions sensibles

Avant signature d'un contrat, on demande au visiteur de **retaper l'email** auquel le token a été envoyé. Si `input.email !== token.recipient_email` → 403. Ça protège contre un lien forwardé.

Optionnel Étape 2 (à figer maintenant, implémenter plus tard) : OTP email 6 chiffres avant signature.

### 3.6 Routes portail (namespace séparé)

```
GET  /api/v1/portal/quotes/:id           (token action: read)
POST /api/v1/portal/quotes/:id/sign      (token action: sign, body: {signerName, signerEmail, signatureBase64})
GET  /api/v1/portal/contracts/:id
POST /api/v1/portal/contracts/:id/sign
GET  /api/v1/portal/invoices/:id
GET  /api/v1/portal/deliverables/:id
POST /api/v1/portal/deliverables/:id/approve
POST /api/v1/portal/deliverables/:id/reject   { reason }
GET  /api/v1/portal/reviews/:requestId
POST /api/v1/portal/reviews/:requestId        { rating, comment }
```

Ces routes sont **isolées** dans `/api/v1/portal/*` — jamais accessibles via session ou API key, jamais confondues avec les routes internes.

### 3.7 Routes de gestion des tokens (côté SaaS)

```
POST   /api/v1/public-tokens             { resourceType, resourceId, recipientEmail, actions[], expiresIn? }
GET    /api/v1/public-tokens?resource=quote:xxx
DELETE /api/v1/public-tokens/:id         → révocation immédiate
```

Génération automatique par n8n à la création d'un devis/contrat/livrable (Étape 5). Génération manuelle possible depuis l'UI.

---

## 4. Contrat d'API `/api/v1/*` — règles transverses

### 4.1 Versioning

- Préfixe `/api/v1/` **immuable** une fois en prod. Breaking changes → `/api/v2/`.
- Deprecation : header `Sunset: <date>` + `Deprecation: true` sur les endpoints anciens, 6 mois minimum avant retrait.

### 4.2 Pagination (standard obligatoire)

Toutes les routes `LIST` :

```
GET /api/v1/clients?limit=50&cursor=eyJpZCI6...

Response:
{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6...",   // null si dernière page
    "hasMore": true,
    "limit": 50
  }
}
```

- **Cursor-based**, pas d'offset (perf + cohérence avec inserts concurrents).
- `limit` max = 100, défaut 25.
- Cursor = base64 de `{ id, createdAt }` de la dernière ligne, opaque côté client.

### 4.3 Filtres & tri (standard)

```
?filter[status]=paid&filter[client_id]=cl_123
?sort=-created_at,name          (- = desc)
?fields=id,name,email           (sparse fieldsets)
```

Chaque route déclare ses filtres/tris autorisés dans une whitelist Zod. Tout champ hors whitelist → 400.

### 4.4 Idempotence (writes)

Toutes les routes `POST` sensibles acceptent `Idempotency-Key: <ulid>` en header. Résultat mis en cache 24h. Rejeu → même réponse, pas de double création. Obligatoire pour : création facture, signature, paiement.

### 4.5 Erreurs (rappel Étape 1)

Format §7 de l'Étape 1. Nouveaux codes Étape 2 :

- `INSUFFICIENT_SCOPE` (403) — API key sans le scope requis
- `TOKEN_EXPIRED` (401) — public token expiré
- `TOKEN_REVOKED` (401)
- `TOKEN_EXHAUSTED` (403) — max_uses atteint
- `IDENTITY_MISMATCH` (403) — email fourni ≠ recipient_email du token
- `IDEMPOTENCY_CONFLICT` (409) — même clé, payload différent

### 4.6 Réponses standards

- Toutes en JSON UTF-8.
- Header `X-Request-Id: req_<ulid>` sur toute réponse (déjà en Étape 1).
- Timestamps ISO 8601 UTC (`2026-08-13T14:22:10.123Z`).
- IDs préfixés par ressource : `cl_`, `pj_`, `qt_`, `ct_`, `inv_`, `exp_`, `dv_`, `rv_`, `sk_`, `pt_`.

---

## 5. Résolution d'identité — le middleware unifié

Ordre de résolution dans le middleware d'auth API :

```
1. Header Authorization: Bearer sk_...    → canal = api_key
2. Header X-Public-Token ou ?token=pt_... → canal = public_token
3. Cookie session=                        → canal = session
4. Aucun                                  → 401 UNAUTHENTICATED
```

Deux canaux présents simultanément → **400 `AMBIGUOUS_AUTH`**. Un appel doit choisir.

Contexte produit :

```ts
type RequestContext = {
  channel: 'session' | 'api_key' | 'public_token';
  organization: { id: string; slug: string };
  db: TenantDb;
  audit: (action: string, meta?: object) => Promise<void>;

  // Selon canal :
  user?: { id: string; email: string; role: Role };        // session uniquement
  apiKey?: { id: string; scopes: Scope[] };                // api_key uniquement
  publicToken?: {
    id: string;
    resourceType: ResourceType;
    resourceId: string;
    actions: PortalAction[];
    recipientEmail: string;
  };                                                        // public_token uniquement
};
```

Helpers d'autorisation :

```ts
requirePermission(ctx, 'invoice.create')      // valide sur session OU api_key (via role/scope)
requireScope(ctx, 'invoices:write')           // api_key uniquement
requirePortalAction(ctx, 'sign')              // public_token uniquement
```

Les routes `/api/v1/portal/*` refusent tout canal ≠ `public_token`.
Les routes `/api/v1/api-keys` refusent tout canal ≠ `session` (on ne crée pas des keys avec une key).

---

## 6. Webhooks — poser l'infra (sans consommateurs métier)

Les événements arriveront en Étapes 3-4-5 (`contract.signed`, `invoice.paid`, `review.created`, `project.delivered`). Dev 2 pose **uniquement l'infrastructure**.

### 6.1 Tables

```
webhook_endpoints
  id                uuid PK
  organization_id   uuid FK
  url               text NOT NULL              (https uniquement, validé)
  secret            text NOT NULL              (32 bytes, pour HMAC)
  events            text[] NOT NULL            (ex: ['contract.signed', '*'])
  active            boolean DEFAULT true
  created_at, updated_at

webhook_deliveries
  id                uuid PK
  endpoint_id       uuid FK → webhook_endpoints(id) ON DELETE CASCADE
  event             text NOT NULL
  payload           jsonb NOT NULL
  status            text NOT NULL              (pending|success|failed|exhausted)
  attempts          integer DEFAULT 0
  next_retry_at     timestamptz NULL
  last_response_code integer NULL
  last_response_body text NULL                 (tronqué à 2 KB)
  created_at, delivered_at
```

### 6.2 Format d'un événement (immuable)

```json
{
  "id": "evt_01H...",
  "type": "contract.signed",
  "created": "2026-08-13T14:22:10Z",
  "organizationId": "org_...",
  "data": { /* payload spécifique à l'événement */ },
  "apiVersion": "v1"
}
```

### 6.3 Signature HMAC

```
X-Webhook-Signature: t=1697203200,v1=<hex sha256>
```

`v1 = HMAC_SHA256(secret, "<timestamp>.<raw_body>")`. Le consommateur vérifie que `|now - t| < 5min` pour bloquer les rejeux.

### 6.4 Retries

Backoff exponentiel : 1min, 5min, 30min, 2h, 6h, 24h → 6 tentatives puis `exhausted`. n8n prendra le relais des retries en Étape 5 mais l'infra doit être en place.

### 6.5 Routes de gestion

```
POST   /api/v1/webhooks              { url, events[] }        → renvoie secret UNE fois
GET    /api/v1/webhooks
GET    /api/v1/webhooks/:id/deliveries?status=failed
POST   /api/v1/webhooks/:id/redeliver/:deliveryId
DELETE /api/v1/webhooks/:id
```

### 6.6 Émission

Helper `emit(event, orgId, data)` — insère dans `webhook_deliveries` pour chaque endpoint souscrit, statut `pending`. Un worker (cron Next.js ou n8n en Étape 5) traitera l'envoi. Dev 2 livre juste un stub qui log — l'important est que l'API `emit()` soit stable dès maintenant.

---

## 7. Rate limiting — étendu

| Cible | Limite | Fenêtre |
|---|---|---|
| Session (par user) | 300 req | 1 min |
| API key `sk_live_` | 1000 req | 1 min (Pro), 10000 (Business) |
| API key `sk_test_` | 100 req | 1 min |
| Public token (par token) | 60 req | 1 min |
| Public token (par IP visitor) | 200 req | 1 min |
| Endpoint `POST /portal/*/sign` | 3 req | 1 h par token |
| Génération API keys | 10 | 1 h par org |
| Génération public tokens | 100 | 1 h par org |

Headers standard sur toute réponse :

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1697203260
```

Dépassement → `429 RATE_LIMITED` avec header `Retry-After`.

Stockage : Upstash Redis (choisi en Étape 1) — sliding window avec `INCR + EXPIRE`.

---

## 8. Documentation OpenAPI

- Spec **générée à partir des schemas Zod** via `zod-to-openapi` — jamais écrite à la main, jamais désynchronisée.
- Fichier `openapi.json` servi sur `/api/v1/openapi.json`.
- UI Scalar (ou Redoc) sur `/api/v1/docs`, publique en lecture, dark mode.
- Chaque route déclare : summary, description, tags, auth requise (session/apikey/publictoken), scopes requis, exemples request/response, tous les codes d'erreur possibles.
- CI bloque le merge si `openapi.json` change sans que `docs/CHANGELOG-API.md` soit mis à jour.

---

## 9. Sécurité — additions Étape 2

- [ ] API key affichée une seule fois, warning UI explicite ("copie-la maintenant, tu ne la reverras jamais").
- [ ] Rotation d'une API key : ancien secret valide 24h, banner UI "rotation en cours".
- [ ] `key_hash` et `token_hash` : sha256, pas de sel (secrets 256-bit random, sel inutile).
- [ ] `crypto.timingSafeEqual` sur toutes les comparaisons de hash.
- [ ] Détection d'anomalie : si `last_used_ip` d'une API key change vers un nouveau pays → log warning + email à l'owner (implémentation basique OK).
- [ ] Les public tokens ne sont **jamais** loggés en clair (ni dans les access logs, ni dans Sentry — middleware de scrubbing `?token=...` → `?token=REDACTED`).
- [ ] Les URLs portail utilisent `noindex, nofollow` (header + meta) pour éviter indexation Google.
- [ ] CORS : `/api/v1/*` autorise `*` pour les GET publics (portal read), stricte allowlist pour tout le reste. Configurable par org en Étape ultérieure.
- [ ] CSP portail : autorise uniquement `self` + le domaine PDF viewer (à définir Étape 4).
- [ ] Signature HMAC webhooks : documentée avec exemple de vérif en Node, Python, PHP.
- [ ] Audit log : ajouter events `apikey.created`, `apikey.revoked`, `apikey.rotated`, `publictoken.created`, `publictoken.used`, `publictoken.revoked`, `webhook.endpoint.created`, `webhook.delivery.failed`.

---

## 10. Ce que Dev 2 ne fait PAS

- Pas de logique métier (aucun endpoint clients/projets/devis/etc. avec du vrai comportement — juste les stubs si nécessaires pour tester l'auth).
- Pas de génération PDF ni R2 (Étape 4).
- Pas de workflows n8n réels (Étape 5) — juste l'émission d'événements en DB.
- Pas de billing/quotas Free/Pro/Business (Étape ultérieure) — mais le champ `plan` sur `organizations` est ajouté pour préparer.

---

## 11. Structure ajoutée

```
/apps/web/src
  /lib
    /api-keys        # generate, verify, rotate, revoke
    /public-tokens   # generate, verify, consume
    /webhooks        # emit, sign, deliver (stub worker)
    /openapi         # zod-to-openapi registry
  /app
    /api/v1
      /api-keys/...
      /public-tokens/...
      /webhooks/...
      /portal
        /quotes/[id]/...
        /contracts/[id]/...
        /invoices/[id]/...
        /deliverables/[id]/...
        /reviews/[requestId]/...
      /openapi.json/route.ts
      /docs/page.tsx
```

---

## 12. Definition of Done — Étape 2

- [ ] Trois canaux d'auth fonctionnent, séparés, testés unitairement.
- [ ] Test d'isolation multi-tenant de l'Étape 1 passe **aussi via API key et via public token**.
- [ ] Une API key ne peut pas accéder aux ressources d'une autre org (test explicite).
- [ ] Un public token de l'org A ne peut pas signer un devis de l'org B (test explicite).
- [ ] Un public token `read` ne peut pas déclencher `sign` (test explicite).
- [ ] Un lien portail forwardé à une autre adresse est bloqué à l'action `sign` (mismatch email).
- [ ] `openapi.json` généré, valide (spectral lint clean), servi sur `/api/v1/openapi.json`.
- [ ] UI docs accessible sur `/api/v1/docs`.
- [ ] Rate limiting effectif, headers présents, dépassement testé.
- [ ] Webhook infra : création endpoint, émission `emit()`, delivery stub, signature HMAC vérifiable via script fourni dans `docs/webhooks.md`.
- [ ] Idempotence : rejeu d'un `POST` avec même `Idempotency-Key` renvoie la réponse cachée.
- [ ] Zéro `any`, zéro warning TS, lint clean.
- [ ] `docs/api.md` : quickstart intégrateur en < 5 min (créer key, faire un call, recevoir un webhook).

---

## 13. Livraison

- Branche `feat/api-auth` → PR sur `main`.
- Review par toi (Oktav) avec **test manuel obligatoire** des 3 canaux via cURL + Postman collection fournie.
- Après merge : Devs 3-4-5 peuvent brancher leurs modules métier sur ce contrat sans jamais toucher à l'auth.