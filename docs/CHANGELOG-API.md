# API Changelog

Changes to the public HTTP API (`/api/v1/*`) are documented here.

## [Unreleased]

### Added
- `POST /api/v1/webhooks/excellence-events`
  - Reçoit les events poussés par n8n vers Excellence (flux inverse du webhook GeniusPay).
  - Headers : `X-Webhook-Signature: t=<unix>,v1=<hex>`, `X-Webhook-Event: <event>`.
  - Vérifie la signature HMAC-SHA256 (secret de l'endpoint `n8n_primary`), fenêtre 5 min.
  - Idempotence par `event.id` via Redis (24h).
  - Réponses : `200` (ok / duplicata), `400` (body invalide), `401` (signature invalide), `429` (rate limit IP 500/min), `503` (aucun endpoint n8n configuré).
  - Aucun scope API key requis : c'est un webhook entrant authentifié par HMAC, pas par bearer token.
