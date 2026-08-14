# Changelog

All notable changes to this project are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added — Étape 5 PR1 : Infrastructure n8n
- Endpoint webhook entrant `POST /api/v1/webhooks/excellence-events` (verify HMAC + idempotence Redis, MVP5 §2.3/§6).
- Migration `0005_n8n_endpoint` : `webhookEndpoints.organization_id` nullable + colonne `kind` (`n8n_primary`).
- Helper d'idempotence `lib/notifications/redis-idempotency.ts` (Upstash Redis, TTL 24h, fallback in-memory).
- Helper de vérification HMAC `lib/notifications/webhook-verify.ts` (format `t=<ts>,v1=<hex>`, fenêtre 5 min).
- Workflows n8n versionnés : `router_dispatch_v1.json`, `healthcheck_v1.json` (`/n8n/workflows/`).
- Scripts `n8n/scripts/deploy.ts` (push API n8n) et `n8n/scripts/lint.ts` (validation JSON).
- ADR `docs/adr/0007-n8n-orchestration.md`.
- Tests unitaires `tests/integration/n8n-webhook-verify.test.ts`.

### Added — Étape 5 PR2 : Emails transactionnels
- 13 workflows email n8n (`email_*.json`) : rendu depuis payload → fetch PDF optionnel → envoi Resend (HTTP Request `api.resend.com/emails`).
- Router mis à jour (`router_dispatch_v1.json`) : 13 nodes Execute Workflow câblés au Switch par event.
- 13 templates MJML FR dans `n8n/email-templates/<name>/fr/` (subject + body).
- Provider email figé : **Resend** (MVP5 §4), expéditeur `no-reply@notifications.excellence.app`.
