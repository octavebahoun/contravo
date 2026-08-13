# Étape 5 — Automatisation n8n (Emails, Relances, Notifications)

**Dev assigné :** Dev 5
**Prérequis :** Étapes 1 à 4 mergées sur `main`.
**Durée estimée :** 6-8 jours
**Objectif :** Brancher n8n comme **seul orchestrateur externe** de la plateforme. n8n consomme les événements webhook émis par Excellence (Étapes 2-3), déclenche les envois d'emails avec PDF en pièce jointe (Étape 4), pilote les relances, propage les notifications internes et exécute les crons. **Aucune logique métier ne quitte Next.js** — n8n n'est qu'un chef d'orchestre.

**Livrable final :** un ensemble de workflows n8n versionnés dans le repo (JSON exports), un playbook opérationnel et des tests bout-à-bout où : envoyer un devis déclenche un email, une facture impayée déclenche une relance J+7/J+14/J+30, une signature de contrat notifie l'équipe interne, un livrable approuvé confirme l'org.

> ⚠️ **Prérequis obligatoire :** lire et appliquer [`standards-dev.md`](./standards-dev.md).

---

## 1. Portée exacte

### 1.1 Inclus
- Endpoint n8n de réception des webhooks Excellence (`contract.signed`, `invoice.paid`, `quote.sent`, etc.).
- Workflows d'envoi d'emails transactionnels (via provider SMTP au choix, voir §4).
- Templates d'emails multilingues (FR par défaut, EN prévu).
- Workflows de relances programmées : devis non vus, factures overdue, livrables en attente d'avis.
- Notifications internes (Slack, Discord ou email interne) pour événements critiques.
- Déclencheurs cron consommant les endpoints internes de l'Étape 3 (`/api/internal/cron/*`).
- Export/import des workflows n8n comme code versionné (`/n8n/workflows/*.json`).
- Monitoring : dashboard des runs, alertes en cas d'échec répété.

### 1.2 Exclus (jamais dans n8n)
- **Logique métier** : calculs, décisions d'état, création d'entités. Tout reste dans Next.js.
- **Accès direct à la DB Neon** : n8n consomme uniquement l'API `/api/v1/*` avec sa propre API key scopée.
- **Génération PDF** : Next.js génère, n8n récupère l'URL et attache à l'email.
- **Traitement de paiement** : GeniusPay parle directement à Next.js (Étape 3), n8n n'intervient pas dans le flux monétaire.

---

## 2. Architecture — Excellence ↔ n8n

### 2.1 Deux flux distincts

**Flux sortant (Excellence → n8n) — événements poussés :**
```
Métier Next.js → emit(event) → webhook_deliveries → worker → POST vers n8n webhook
```

**Flux entrant (n8n → Excellence) — actions déclenchées :**
```
n8n workflow → HTTP node → Bearer sk_live_... → /api/v1/... → Next.js
```

n8n possède **une API key dédiée** par environnement, scope `webhooks:manage` + scopes lecture (`clients:read`, `invoices:read`, etc.). Jamais de scope `*`.

### 2.2 Configuration côté Excellence

Une seule table nouvelle (ou row de config par org) pour identifier l'endpoint n8n :

```
integration_endpoints
  id                    uuid PK
  organization_id       uuid FK   NULL     (null = endpoint global Excellence, sinon par org)
  kind                  text NOT NULL      (enum: 'n8n_primary')
  url                   text NOT NULL      (https uniquement)
  secret                text NOT NULL      (HMAC secret, chiffré comme les credentials GeniusPay)
  active                boolean DEFAULT true
  events                text[] NOT NULL    (subset des événements Étape 2 §6)
  created_at, updated_at
```

Au MVP : **un seul endpoint n8n global** (row avec `organization_id = null`), qui reçoit tous les événements de toutes les orgs. Le payload webhook contient `organizationId`, n8n route en interne.

### 2.3 Endpoints n8n exposés

Un seul webhook trigger n8n de réception, il dispatche par `event` dans le body :

```
POST https://n8n.excellence.app/webhook/excellence-events
Headers:
  X-Webhook-Signature: t=<unix>,v1=<hex>
  X-Webhook-Event: contract.signed
  X-Excellence-Environment: staging | prod
Body: (payload standard Étape 2 §6.2)
```

n8n vérifie HMAC + timestamp exactement comme Excellence vérifie les webhooks GeniusPay (Étape 3 §5.9). Rejette si invalide.

---

## 3. Workflows n8n — inventaire

Chaque workflow = un fichier JSON dans `/n8n/workflows/`. Nom = snake_case + version.

### 3.1 Workflow router

`router_dispatch_v1.json`

Reçoit tous les événements sur le webhook `/excellence-events`, vérifie signature, puis dispatche via un Switch node vers le sous-workflow correspondant. C'est le seul workflow qui écoute la webhook publique.

### 3.2 Workflows email transactionnel

| Fichier | Déclencheur (event) | Destinataire | Contenu |
|---|---|---|---|
| `email_quote_sent_v1.json` | `quote.sent` | client | Le devis <number> vous attend + lien portail + PDF attaché |
| `email_quote_accepted_v1.json` | `quote.accepted` | équipe interne (owner+admin) | Notification acceptation |
| `email_quote_rejected_v1.json` | `quote.rejected` | équipe interne | Notification + raison |
| `email_contract_sent_v1.json` | `contract.sent` | client | Contrat à signer + lien portail + PDF |
| `email_contract_signed_v1.json` | `contract.signed` | client + équipe | Confirmation + PDF cacheté |
| `email_invoice_sent_v1.json` | `invoice.sent` | client | Facture <number> + lien portail paiement + PDF |
| `email_invoice_paid_v1.json` | `invoice.paid` | client + équipe | Reçu de paiement + PDF |
| `email_invoice_overdue_v1.json` | `invoice.overdue` | client | Rappel impayé + lien portail |
| `email_deliverable_submitted_v1.json` | `deliverable.submitted` | client | Livrable à valider + lien |
| `email_deliverable_approved_v1.json` | `deliverable.approved` | équipe | Validation |
| `email_review_requested_v1.json` | `review.requested` | client | Merci de donner votre avis + lien |
| `email_review_created_v1.json` | `review.created` | équipe | Nouvel avis reçu |
| `email_payment_failed_v1.json` | `invoice.payment_failed` | client | Paiement échoué + suggestion réessai |

### 3.3 Workflows de relance (cron)

| Fichier | Fréquence | Action |
|---|---|---|
| `cron_quote_reminder_v1.json` | Quotidien 9h | Appelle `/api/v1/quotes?status=sent&sentBefore=J-7` → email de rappel |
| `cron_invoice_overdue_check_v1.json` | Quotidien 8h | Appelle `/api/internal/cron/mark-invoices-overdue` puis liste les nouvelles overdue → email |
| `cron_invoice_reminder_v1.json` | Quotidien 10h | Relances progressives J+7, J+14, J+30 après échéance |
| `cron_deliverable_pending_v1.json` | Quotidien | Livrables submitted > 5j sans réponse → rappel client |
| `cron_review_reminder_v1.json` | Hebdo | Demandes d'avis sans réponse depuis 14j → relance |
| `cron_public_tokens_purge_v1.json` | Quotidien 3h | Appelle `/api/internal/cron/expire-public-tokens` |
| `cron_webhook_deliveries_retry_v1.json` | Toutes les 5min | Appelle un endpoint interne qui rejoue les `webhook_deliveries` failed non-exhausted |

Les crons n8n appellent les endpoints internes Excellence via header `X-Cron-Secret` (Étape 3 §8).

### 3.4 Workflows notifications internes

| Fichier | Déclencheur | Canal |
|---|---|---|
| `notify_slack_critical_v1.json` | `webhook.delivery.failed` (3× consécutifs) | Slack tech-alerts |
| `notify_slack_new_client_v1.json` | `client.created` (via API key seulement) | Slack sales |
| `notify_email_signature_v1.json` | `contract.signed` | Email owner org |
| `notify_email_payment_failed_v1.json` | `invoice.payment_failed` | Email admin org |

### 3.5 Workflow de test santé

`healthcheck_v1.json` — cron toutes les 5 min, appelle `/api/v1/me` avec la clé n8n, vérifie 200. Si KO 3× → alerte Slack + email ops.

---

## 4. Provider SMTP / transactional email

Choix à figer par Oktav avant Dev 5. Options :

| Provider | Avantages | Contraintes |
|---|---|---|
| **Resend** | Simple, DX moderne, pricing clair | Deliverability à monitorer sur XOF Africa |
| **Postmark** | Excellente reputation, analytics détaillés | Prix un peu plus élevé |
| **Brevo (ex-Sendinblue)** | Bon en Afrique francophone, free tier généreux | Interface plus lourde |
| **AWS SES** | Le moins cher à volume | Config complexe, reputation à construire |

Recommandation Excellence : **Resend** au MVP (rapidité intégration, bonne réputation SPF/DKIM/DMARC par défaut). Migration Postmark si deliverability insuffisante.

Domaine d'envoi : `no-reply@notifications.excellence.app` avec SPF, DKIM, DMARC configurés.

---

## 5. Templates emails

### 5.1 Structure

Chaque template = 2 fichiers dans `/n8n/email-templates/<name>/` :
- `subject.txt` — sujet, avec placeholders `{{...}}`
- `body.mjml` — corps en MJML (compilé HTML responsive) ou HTML direct
- (optionnel) `body.txt` — version texte pour clients mail-only

Rendu par n8n via un node "Code" qui compile MJML → HTML et remplace les placeholders avec les données du payload.

### 5.2 Placeholders universels

Chaque email dispose de :
- `{{org.name}}`, `{{org.logoUrl}}`, `{{org.brandColor}}`, `{{org.email}}`, `{{org.phone}}`
- `{{client.name}}`, `{{client.email}}`
- `{{portalUrl}}` — lien portail avec token public déjà intégré
- `{{unsubscribeUrl}}` — lien de désinscription (obligatoire RGPD, même transactionnel)

### 5.3 Multilingue

Structure `/n8n/email-templates/<name>/fr/`, `/en/`. n8n choisit la langue via `payload.recipient.locale` (à ajouter côté Excellence sur `clients.locale`, défaut `fr`).

MVP : FR uniquement. EN prêt techniquement, activation post-MVP.

### 5.4 PDF en pièce jointe

Pour chaque email nécessitant un PDF (`quote.sent`, `contract.sent`, `contract.signed`, `invoice.sent`, `invoice.paid`) :
1. n8n récupère l'URL de download depuis l'API : `GET /api/v1/{entity}/{id}/pdf/download` avec sa clé.
2. Le serveur renvoie `302` vers un presigned R2 valide 60 min.
3. n8n suit la redirection, télécharge le PDF en mémoire.
4. Attache au mail comme `application/pdf`, nom = `{{number}}.pdf`.

Limite taille attachment : 10 Mo (au-delà, envoyer un lien de download plutôt qu'attacher).

---

## 6. Sécurité — additions Étape 5

- [ ] HMAC vérification obligatoire sur `POST /webhook/excellence-events` — rejet 401 si signature invalide.
- [ ] Fenêtre timestamp 5 min (rejet replay).
- [ ] API key n8n avec **scopes minimaux** : `webhooks:manage`, `clients:read`, `invoices:read`, `quotes:read`, `contracts:read`, `deliverables:read`, `reviews:read`. **Aucun write** sauf `webhooks:manage` (pour créer/retirer endpoints).
- [ ] Secret HMAC de l'endpoint n8n : rotation trimestrielle documentée.
- [ ] Rate limit côté Excellence sur les appels sortants vers n8n : max 100/sec, backoff exponentiel si n8n répond > 500.
- [ ] Rate limit côté n8n sur `/webhook/excellence-events` : ignore les événements dupliqués via `event.id` en cache Redis 24h (idempotence bout-à-bout).
- [ ] Aucun secret ne transite jamais en clair : les credentials SMTP, tokens API, clés HMAC sont dans les credentials n8n (chiffrés), jamais dans les workflows JSON exportés.
- [ ] Emails jamais envoyés depuis un domaine non-authentifié SPF/DKIM/DMARC.
- [ ] Logs n8n : masquage automatique des tokens, emails, PDFs binaires (juste taille loggée).
- [ ] Audit : chaque envoi d'email produit un événement `notification.sent` dans les logs Excellence (via `POST /api/v1/notifications/log` — nouvel endpoint minimal à ajouter côté Excellence).
- [ ] Désabonnement : lien unique par destinataire, honoré immédiatement (pas de "48h de délai"), stocké côté Excellence dans nouvelle table `email_unsubscribes`.
- [ ] Bounce handling : provider SMTP → webhook vers n8n → workflow qui appelle Excellence pour marquer `clients.email_deliverable = false`.

---

## 7. Versionnage des workflows

- Chaque workflow est exporté via l'UI n8n comme JSON, commité dans `/n8n/workflows/`.
- Nommage `<name>_v<N>.json`. Modif majeure = nouveau v+1, ancien conservé pour rollback.
- Un README `/n8n/README.md` explique : comment importer, comment tester en local avec n8n local instance, comment déployer en staging/prod.
- **Deploy** : script `pnpm n8n:deploy:staging` qui utilise l'API n8n pour uploader les workflows depuis le repo.
- Pas de modification "manuelle" en prod hors procédure d'urgence (documentée).

---

## 8. Structure ajoutée

```
/n8n
  /workflows
    router_dispatch_v1.json
    email_quote_sent_v1.json
    email_contract_signed_v1.json
    ... (tous les workflows §3)
    cron_invoice_reminder_v1.json
    healthcheck_v1.json
  /email-templates
    /quote_sent
      /fr
        subject.txt
        body.mjml
    /invoice_paid
      /fr
        ...
  /scripts
    deploy.ts               # push workflows vers n8n API
    lint.ts                 # valide JSON schema des workflows
  README.md
  DEPLOY.md
  TROUBLESHOOTING.md

/apps/web/src
  /lib
    /notifications
      log.service.ts        # /api/v1/notifications/log
      unsubscribe.service.ts
      bounce-handler.ts
  /app/api/v1
    /notifications/log/route.ts       # n8n → Excellence
    /notifications/unsubscribe/route.ts (public, avec token)
  /app/(public)/unsubscribe/page.tsx  # UI désabonnement

/apps/web/tests/integration
  /notifications
    quote-sent-email-flow.test.ts     # mock n8n, vérifie payload attendu
    unsubscribe.test.ts
    bounce-handling.test.ts
```

---

## 9. Definition of Done — Étape 5

- [ ] Endpoint n8n `/excellence-events` reçoit et vérifie HMAC correctement.
- [ ] Les 14 workflows email de §3.2 fonctionnent bout-à-bout (test manuel + captures d'écran email dans PR).
- [ ] Les 7 workflows cron tournent, testés en staging pendant 48h sans erreur.
- [ ] PDF attaché correctement pour les 5 emails concernés.
- [ ] Provider SMTP configuré, SPF/DKIM/DMARC verts sur `mail-tester.com` (score ≥ 9/10).
- [ ] Test bout-à-bout : créer devis → envoyer → email reçu par un vrai destinataire de test avec PDF.
- [ ] Test relance : facture avec `due_date - 8j` → n8n envoie email J+7.
- [ ] Test idempotence : rejouer un événement 10× → 1 seul email envoyé.
- [ ] Test désabonnement : clic sur unsubscribe → aucun email suivant vers ce destinataire.
- [ ] Test bounce : email invalide → `clients.email_deliverable = false` mis à jour.
- [ ] Healthcheck workflow vert, alerte Slack testée.
- [ ] Workflows JSON commités et importables via script.
- [ ] `docs/n8n-operations.md`, `docs/email-templates.md`, `docs/notification-events.md` à jour.
- [ ] Lint + coverage ≥ 80% côté endpoints Excellence ajoutés.

---

## 10. Ce que Dev 5 ne fait PAS

- Pas de refonte de la logique métier — n8n n'écrit jamais dans la DB Excellence hors via l'API publique.
- Pas de traitement des paiements GeniusPay (fait par Excellence Étape 3).
- Pas de génération PDF (Étape 4).
- Pas de SMS (post-MVP, workflow n8n supplémentaire).
- Pas d'in-app notifications (post-MVP, nécessite WebSocket).

---

## 11. Livraison

Découpe en 3 PRs :
1. `feat/step5-n8n-infrastructure` (endpoint /excellence-events, router, healthcheck, deploy script)
2. `feat/step5-transactional-emails` (14 workflows email + templates)
3. `feat/step5-crons-and-reminders` (7 workflows cron + unsubscribe/bounce)

Review par toi + un dev familier avec n8n (à défaut, session pair-programming). Après merge : le MVP fonctionnel est **complet**. Reste l'Étape 6 (billing SaaS) pour la monétisation.