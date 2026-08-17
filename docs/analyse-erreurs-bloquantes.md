# Analyse des erreurs bloquantes — Contravo

Date : 17/08/2026
Portée : erreurs bloquantes détectées sur `contravo-7g6p.vercel.app` et dans le code source. Aucun correctif appliqué.

---

## 1. POST /api/v1/quotes et POST /api/v1/invoices → 500 (BLOQUANT — reproduit)

### Symptôme
```
POST https://contravo-7g6p.vercel.app/api/v1/invoices 500 (Internal Server Error)
/api/v1/quotes:1 Failed to load resource: the server responded with a status of 500 ()
```

### Cause racine
`emit()` dans `lib/webhooks/index.ts:43` insère le payload de l'événement dans la colonne `payload` (jsonb) de la table `webhook_deliveries`.

Ce payload contient des **BigInt** (`subtotalCents`, `discountCents`, `taxCents`, `totalCents`, `unitPriceCents`, `amountCents` — drizzle les retourne en mode `bigint`).

**postgres.js ne sait pas sérialiser un BigInt** : `Do not know how to serialize a BigInt`.

Comme `emit()` est appelé **à l'intérieur de `db.transaction()`** (`createQuote`, `createInvoice`, etc.), l'exception fait **rollback de toute la transaction** → le handler renvoie 500 (`INTERNAL_ERROR`).

### Preuve
- Reproduit en production : `POST /api/v1/invoices` (payload valide, client + projet existants) → `{"error":{"code":"INTERNAL_ERROR",...}}` HTTP 500.
- Reproduit localement (`tsx` sur les repositories) :
  - `createQuote` → `Do not know how to serialize a BigInt`
  - `createInvoice` → `Do not know how to serialize a BigInt`

### Déclencheur (régression)
Le commit `ec5b9c5` (« configure n8n production webhook and allow global event dispatching ») a modifié `emit()` pour matcher aussi les endpoints globaux :
```ts
or(
  eq(webhookEndpoints.organizationId, organizationId),
  eq(webhookEndpoints.kind, 'n8n_primary')
)
```
Or la base contient un endpoint `n8n_primary` global, `events: ['*']`, `active: true` → **toutes les organisations** passent par l'insertion `webhook_deliveries` à chaque événement → toutes les écritures cassent. Avant ce commit, seules les orgs ayant leur propre endpoint étaient impactées.

### Impact
Toutes les mutations des entités qui portent des montants BigInt :
- Quotes (création, mise à jour, suppression)
- Invoices (création, mise à jour, suppression, paiement)
- Expenses, Deliverables, Contracts, Projects (budget), Reviews, Clients/Archivage, paiements GeniusPay
→ 39 call sites `emit()` concernés.

### Localisation du correctif (non appliqué)
`lib/webhooks/index.ts` → `emit()` : sérialiser en profondeur le payload (BigInt → string) avant l'insertion dans `webhook_deliveries.payload`, ou n'appeler `emit` qu'avec un payload déjà sérialisé (hors transaction).

---

## 2. GET /api/v1/quotes → 500 (BLOQUANT — non reproductible sur la build actuelle)

### Symptôme
```
/api/v1/quotes:1 Failed to load resource: the server responded with a status of 500 ()
```

### Statut de l'analyse
Non reproductible sur le déploiement actuel : le GET a été testé en production pour **toutes les organisations ayant des données** (quotes, invoices, clients, projets) → **200 partout**.

Hypothèses restantes :
- Build déployée au moment du constat (ancienne version avant « renouveau ») contenait un bug corrigé depuis ;
- Ou erreur transitoire liée à la même régression `emit()` si un autre endpoint était appelé.

### Action recommandée
Re-tester après un nouveau déploiement ; vérifier les logs Vercel (`console.error` de `formatErrorResponse` et du middleware) si le 500 réapparaît.

---

## Fichiers clés concernés
| Fichier | Rôle |
|---|---|
| `lib/webhooks/index.ts` | `emit()` — insertion payload BigInt dans jsonb (cause n°1) |
| `lib/repositories/quotes.repo.ts` | `createQuote` — `emit('quote.created')` dans la transaction |
| `lib/repositories/invoices.repo.ts` | `createInvoice` — `emit('invoice.created')` dans la transaction |
| `middleware.ts` | auth API, rate-limiting (peut aussi renvoyer 500 en cas d'erreur non gérée) |
| `app/api/v1/quotes/route.ts`, `app/api/v1/invoices/route.ts` | handlers POST/GET, sérialisation des réponses |