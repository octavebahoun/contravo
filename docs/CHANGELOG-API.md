# API Changelog

Changes to the public HTTP API (`/api/v1/*`) are documented here.

## [Unreleased]

### Fixed
- `POST /api/v1/quotes` et `POST /api/v1/invoices` renvoyaient `500` : `emit()` insérait un payload contenant des `bigint` dans `webhook_deliveries.payload` (jsonb), `JSON.stringify` jetait, et comme `emit()` est appelé dans le `db.transaction()` de `createQuote`/`createInvoice`, toute la transaction était annulée. Généralisé par `ec5b9c5`, qui fait matcher l'endpoint global `n8n_primary` pour toutes les organisations. Les payloads sont désormais normalisés en profondeur (`toJsonSafe`).
- Payload webhook — les champs monétaires (`subtotalCents`, `discountCents`, `taxCents`, `totalCents`, `unitPriceCents`, `amountCents`) sont transmis en **chaînes décimales**, comme le fait déjà l'API pour ces mêmes colonnes. `buildEventPayload` émettait `totalCents` en `number` : le type dépendait du chemin de code ayant construit l'événement. Les `Date` sont sérialisées en ISO 8601.
- `POST /api/v1/auth/*` et `POST /api/v1/invitations/accept` répondaient `401` avant d'atteindre leur handler : le middleware exigeait un contexte d'auth sur toute route `/api/v1`. Ces routes sont désormais exemptées — elles valident elles-mêmes leurs identifiants.
- `POST /api/v1/webhooks/excellence-events` et `POST /api/v1/webhooks/geniuspay-excellence` répondaient `401` pour la même raison. Ils sont authentifiés par HMAC et sont maintenant exemptés, au même titre que `/api/v1/webhooks/geniuspay`. `POST /api/v1/webhooks/verify` reste protégé par API key (sinon il devient un oracle de signature ouvert).
- Les en-têtes internes (`x-auth-type`, `x-user-id`, `x-organization-id`, `x-is-super-admin`, …) fournis par le client sont désormais purgés à l'entrée du middleware ; seules les valeurs qu'il calcule atteignent les handlers.
- `GET|POST /api/v1/expenses` et `GET|PATCH /api/v1/expenses/:id` renvoyaient `500` (`amountCents` bigint non sérialisable). Les montants sont désormais transmis en chaînes décimales, comme sur les devis et factures. Idem `fileSizeBytes` sur les livrables.
- `GET /api/v1/projects/:id/expenses` renvoyait `500` pour la même raison : le raccourci retournait les lignes brutes sans passer par `serializeExpense`. Il échouait dès qu'un projet avait au moins une dépense.
- `POST /api/v1/{invoices,quotes,contracts}/:id/pdf/regenerate` renvoyait `500` dès qu'une première version du PDF existait : la clé R2 d'un document est stable et l'insertion violait `files_r2_key_unique`. La ligne `files` est désormais mise à jour en place.
- Le montant transmis à GeniusPay était divisé par 100, y compris pour le XOF qui n'a pas de subdivision : une facture de 25 000 XOF aurait été encaissée 250 XOF. Le webhook centuplait symétriquement les frais et le montant net, et créditait le montant de l'intention plutôt que celui réellement confirmé par la passerelle.

### Added
- Endpoints webhook sortants (scopes `webhooks:read` / `webhooks:manage`) :
  - `GET /api/v1/webhooks/endpoints` — liste les endpoints de l'organisation. **Ne renvoie jamais le secret.** Le `n8n_primary` global de la plateforme est exclu.
  - `POST /api/v1/webhooks/endpoints` — `{ url, events }`. Renvoie `201` avec le `secret`, **affiché une seule fois**. `400` si l'URL n'est pas HTTPS, si l'hôte est privé/local, ou si un nom d'événement est inconnu ; `403 QUOTA_EXCEEDED` au-delà du quota du plan.
  - `PATCH /api/v1/webhooks/endpoints/:id` — `{ url?, events?, active? }`.
  - `DELETE /api/v1/webhooks/endpoints/:id` — l'historique de livraison cascade.
  - `POST /api/v1/webhooks/endpoints/:id/rotate-secret` — nouveau secret, renvoyé une fois. Les anciennes signatures cessent d'être valides.
  - `POST /api/v1/webhooks/endpoints/:id/test` — envoie un événement `webhook.test` signé et **attend** la réponse : `{ deliveryId, status, attempts, responseCode, responseBody }`.
  - `GET /api/v1/webhooks/deliveries` — historique (`endpointId`, `status`, `limit`, plafonné à 200).
  - `POST /api/v1/webhooks/deliveries/:id/redeliver` — rejoue une livraison, y compris `exhausted`.
  - Les endpoints d'une autre organisation, et celui de la plateforme, répondent `404`.
- `POST /api/v1/portal/invoices/:id/pay`
  - Ouvre un paiement en ligne depuis le portail client. Authentifiée par jeton public, action `pay`.
  - Réponse `201` : `{ paymentIntentId, checkoutUrl, amountCents, currency, expiresAt }`.
  - L'intention porte le **solde restant dû**, pas le total. `400` si la facture n'est pas `sent`, `partial` ou `overdue` ; `409 PAYMENT_NOT_CONFIGURED` si l'organisation n'a pas de passerelle active ; `502 PAYMENT_INITIATION_FAILED` si GeniusPay refuse.
  - Le jeton public n'est pas consommé : un checkout abandonné doit pouvoir être repris.
- `GET /api/v1/portal/invoices/:id` expose `onlinePayment`, qui indique si le checkout est réellement disponible pour cette organisation.
- `GET|POST /api/v1/invoices/:id/payments`
  - `GET` liste les encaissements d'une facture (scope `invoices:read`).
  - `POST` enregistre un paiement manuel (scope `invoices:write`) : `amountCents` (chaîne décimale), `method` (`bank_transfer`|`mobile_money`|`card`|`cash`|`check`|`other`), `paidAt`, `reference`, `notes` optionnels. `source` est forcé à `manual`.
  - Recalcule `amountPaidCents`, fait passer la facture en `partial` ou `paid`, et émet `invoice.paid` lorsqu'elle est soldée.
  - `400` si le montant est nul ou négatif, ou si la facture n'est pas `sent`, `partial` ou `overdue`.
  - Réponse `201` : `{ payment, invoice: { id, status, amountPaidCents, totalCents, paidAt } }`.
- `GET /api/v1/deliverables`
  - Liste les livrables de toute l'organisation (filtres `projectId`, `status`, `page`, `limit`).
  - Scope requis : `deliverables:read`.
  - La création reste sur `POST /api/v1/projects/:id/deliverables`.

### Changed
- Enforcement des quotas MVP6 à la création : `POST /api/v1/clients`, `POST /api/v1/projects`, `POST /api/v1/api-keys` et `POST /api/v1/organizations/:slug/invitations` renvoient `403 QUOTA_EXCEEDED` avec `details: { quotaKey, current, limit, planId }` lorsque le plan est saturé. Le siège est réellement consommé par `POST /api/v1/invitations/accept`, qui vérifie aussi le quota.
- Les appels `/api/v1/*` authentifiés sont comptabilisés dans `quota_period_usage.api_calls_count` (métrage mensuel MVP6). Un échec de comptage n'interrompt jamais la requête.
- Le palier de rate limiting `business` existe désormais (5 000 req/min) : une org Business retombait silencieusement sur la limite Free. `enterprise` est conservé comme alias.

- `POST /api/v1/webhooks/excellence-events`
  - Reçoit les events poussés par n8n vers Excellence (flux inverse du webhook GeniusPay).
  - Headers : `X-Webhook-Signature: t=<unix>,v1=<hex>`, `X-Webhook-Event: <event>`.
  - Vérifie la signature HMAC-SHA256 (secret de l'endpoint `n8n_primary`), fenêtre 5 min.
  - Idempotence par `event.id` via Redis (24h).
  - Réponses : `200` (ok / duplicata), `400` (body invalide), `401` (signature invalide), `429` (rate limit IP 500/min), `503` (aucun endpoint n8n configuré).
  - Aucun scope API key requis : c'est un webhook entrant authentifié par HMAC, pas par bearer token.
