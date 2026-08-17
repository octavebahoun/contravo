# Changelog

All notable changes to this project are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added — Parcours d'invitation d'équipe
- Page publique `/invite/[token]` : nom de l'organisation, auteur de l'invitation, rôle proposé, et acceptation en un clic. Le jeton était généré et stocké mais **aucun email n'était envoyé et aucun écran ne permettait de l'accepter** — un invité ne pouvait jamais rejoindre une organisation.
- Événement `invitation.sent`, template MJML `invitation_sent/fr`, workflow `email_invitation_sent_v1` et branche dans `router_dispatch_v1`.
- `lib/invitations/index.ts` : création d'invitation partagée entre `POST /api/v1/organizations/[slug]/invitations` et le formulaire du tableau de bord. Les deux chemins divergeaient ; seul l'un vérifiait le quota de membres.
- L'inscription accepte `inviteToken` : un invité sans compte rejoint l'organisation qui l'a invité au lieu de s'en voir créer une nouvelle.

### Security — Invitations et redirections d'authentification
- `POST /api/v1/invitations/accept` refuse désormais une invitation dont l'adresse ne correspond pas au compte connecté (`403 EMAIL_MISMATCH`). Un lien transféré ou intercepté permettait à n'importe quel titulaire de compte d'entrer dans l'organisation.
- Le champ `redirect` des formulaires de connexion et d'inscription était collecté puis ignoré. Il est maintenant honoré, restreint aux chemins internes (`/…`, jamais `//…`) pour éviter une redirection ouverte.

### Security — Réinitialisation de mot de passe
- **Le jeton de réinitialisation était `reset-password-<userId>`**, non stocké, sans expiration et sans usage unique : toute personne connaissant l'UUID d'un utilisateur pouvait changer son mot de passe. Remplacé par un jeton aléatoire de 32 octets, stocké en SHA-256 dans la nouvelle table `password_reset_tokens`, valable une heure et à usage unique (migration `0007`).
- Une nouvelle demande invalide les liens précédents ; la réinitialisation révoque toutes les sessions de l'utilisateur.

### Added — Écrans de mot de passe oublié
- Pages `/forgot-password` et `/reset-password`, lien « Mot de passe oublié ? » sur `/sign-in`. La confirmation est identique que l'email existe ou non, pour ne pas divulguer les comptes enregistrés.
- Événement `user.password_reset_requested`, template MJML `password_reset_requested/fr`, workflow `email_password_reset_requested_v1` et branche correspondante dans `router_dispatch_v1`. Aucun email n'était envoyé auparavant.
- `emit()` accepte `organizationId = null` pour les événements de compte, qui n'appartiennent à aucune organisation et ne visent que l'endpoint global `n8n_primary`.
- `app/(login)/auth-shell.tsx` : mise en page commune aux écrans non authentifiés.

### Added — Rétrogradation d'abonnement en libre-service (MVP6)
- `cancelSubscription()` / `resumeSubscription()` dans `lib/billing/saas-billing.service.ts`, exposés par `POST /api/v1/billing/cancel` et `POST /api/v1/billing/resume`. La rétrogradation est programmée en fin de période payée (`cancel_at_period_end`), sans remboursement ni proratisation, et reste réversible jusqu'à l'échéance.
- `getSubscription()` applique la bascule vers `free` à la lecture quand la période est échue : la rétrogradation ne dépend pas de la présence d'un cron.
- Écran Abonnement : le bouton du forfait Gratuit ouvre une confirmation explicite (limites reprises, absence de remboursement) ; une bannière signale la rétrogradation programmée avec sa date d'effet et permet de la reprendre.

### Fixed — Souscription aux forfaits payants
- `POST /api/v1/billing/subscribe` : le contrat divergeait de l'appelant (`targetPlanId` envoyé contre `planId` attendu, `organizationId` absent, réponse imbriquée dans `data`). Les boutons « Passer à Pro » et « Passer à Business » échouaient en `400`. L'organisation est désormais lue dans le contexte de requête et non dans le corps.
- `formatErrorResponse` traduit `BillingServiceError` en son propre code HTTP au lieu d'un `500` générique.

### Added — Reprise des livraisons webhook (MVP5 §6)
- `retryDueDeliveries()` dans `lib/webhooks/index.ts` : rejoue les livraisons dont le `next_retry_at` est échu et les `pending` abandonnées depuis plus de 15 min (le dispatch fire-and-forget ne survit pas au gel du lambda). `next_retry_at` était calculé à chaque échec mais **relu par personne** : une livraison mourait après un seul essai, sans trace ni alerte.
- Réclamation concurrente sûre : `FOR UPDATE SKIP LOCKED` + bail de 10 min posé sur `next_retry_at`. Deux exécutions simultanées ne peuvent pas envoyer deux fois le même webhook, et une exécution interrompue libère ses lignes à l'expiration du bail au lieu de les bloquer.
- Endpoint `POST /api/internal/cron/webhook-retries`, hors `/api/v1` (le sweep est global, il n'appartient à aucun tenant). Authentifié par `CRON_SECRET` en bearer, comparaison à temps constant, fail closed si la variable est absente, rate limit par IP.
- Workflow `n8n/workflows/cron_webhook_retries_v1.json` (Schedule 5 min) et variable `CRON_SECRET` documentée dans `.env.example`.
- Livraison at-least-once assumée : le payload conserve son `id` d'événement d'origine, ce qui permet au consommateur de dédupliquer.

### Fixed — Correctifs bloquants
- `lib/webhooks/index.ts` : normalisation profonde du payload (`toJsonSafe`) avant insertion outbox, signature HMAC et envoi HTTP. Les `bigint` renvoyés par drizzle faisaient jeter `JSON.stringify` à l'insertion dans `webhook_deliveries.payload`, à l'intérieur de la transaction de `createQuote`/`createInvoice` — d'où un `500` sur la création de devis et de factures.
- Middleware : `/api/v1/auth/*`, `/api/v1/invitations/accept` et les webhooks authentifiés par HMAC ne sont plus interceptés par le contrôle d'auth (ils répondaient `401` avant leur handler).
- Middleware : purge des en-têtes d'auth internes fournis par le client avant transmission aux handlers.
- `lib/payments/credentials.service.ts` : suppression de la clé KEK de repli codée en dur. L'absence de `PAYMENT_CREDENTIALS_KEK` échoue désormais explicitement.
- `components/nav-user.tsx` : la déconnexion et les entrées du menu utilisateur étaient inertes — aucun moyen de se déconnecter depuis l'interface. `signOut` purge aussi le cookie `organization_id`.
- Sérialisation des colonnes `bigint` sur les routes dépenses et livrables (elles renvoyaient `500`).
- `.env.example` : aligné sur les variables réellement lues (ajout des `EXCELLENCE_GENIUSPAY_*` et `NEXT_PUBLIC_APP_URL`, retrait des `STRIPE_*` et `GENIUS_SANDBOX_*` orphelines).

### Added — Modules métier dans l'interface (MVP3)
- Écrans `/dashboard/contracts`, `/dashboard/deliverables`, `/dashboard/expenses` et `/dashboard/reviews`, branchés sur les routes `/api/v1` existantes ; les quatre modules sont ajoutés à la barre latérale.
- Route `GET /api/v1/deliverables` (liste à l'échelle de l'organisation) réutilisant `listDeliverables`.
- `app/(dashboard)/dashboard/_components/module-ui.tsx` : helpers partagés (badges de statut, formats, en-tête, carte KPI) des nouveaux écrans.

### Added — Enforcement des quotas (MVP6)
- `assertQuota` est appliqué à la création de clients, projets, clés API, invitations et adhésions ; `recomputeQuotaUsage` maintient les compteurs à jour.
- `QuotaExceededError` est traduit en `403 QUOTA_EXCEEDED` par `formatErrorResponse` (il produisait un `500`).
- Métrage mensuel des appels API dans le middleware via `incrementPeriodUsage`.
- Palier de rate limiting `business` ajouté (`enterprise` conservé comme alias).

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
