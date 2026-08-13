# ADR 0007 — n8n comme orchestrateur externe unique

- **Statut :** Accepté
- **Date :** 2026-08-14
- **Décision :** n8n est le seul orchestrateur externe de la plateforme Excellence. Il consomme les événements webhook émis par l'app (Étapes 2-3), déclenche les envois d'emails, pilote les relances cron et propage les notifications internes. Aucune logique métier ne quitte Next.js.

## Contexte

L'Étape 5 (MVP5) demande d'automatiser emails, relances et notifications. Deux options étaient possibles :

1. L'app (Next.js) déclenche et envoie tout via un provider SMTP SDK.
2. n8n orchestre : reçoit les events, appelle l'API Excellence en retour, envoie les emails.

## Décision

Option 2. n8n est un chef d'orchestre qui **ne fait jamais de décision métier**. Toute la logique (états, calculs, entités) reste dans Next.js. n8n consomme uniquement l'API `/api/v1/*` avec une API key scopée, et reçoit les events sur un webhook unique `/api/v1/webhooks/excellence-events`.

### Choix structurants validés
- **Provider email : Resend** (MVP5 §4). Envoi via node HTTP Request → `https://api.resend.com/emails`, clé `RESEND_API_KEY` dans un credential n8n chiffré. Expéditeur `no-reply@notifications.excellence.app`.
- **Idempotence `event.id` : Upstash Redis** (client `@upstash/redis` déjà présent), fenêtre 24h, fallback in-memory si non configuré.
- **Webhook endpoint n8n :** réutilisation de la table existante `webhookEndpoints` (migration `0005_n8n_endpoint` rend `organization_id` nullable + colonne `kind='n8n_primary'`). Pas de nouvelle table `integration_endpoints`.
- **Structure repo : plate** (pas de `apps/web`), alignée sur le monorepo réel.

## Conséquences

- Les workflows n8n sont versionnés en JSON dans `/n8n/workflows/` et déployés via l'API n8n (`n8n/scripts/deploy.ts`).
- La sécurité (HMAC, timestamp 5 min, scopes minimaux, masquage secrets) est documentée dans MVP5 §6 et appliquée côté Excellence.
- Toute la logique métier reste testable sans n8n (mocks).
