# Audit de sécurité & conformité — Contravo (SaaS devis / factures / paiements)

- **Date** : 2026-08-17
- **Périmètre** : dépôt entier (code applicatif, libs, schémas, middleware, webhooks, n8n, tests), historique git, dépendances.
- **Stack** : Next.js 15 (App Router, canary), TypeScript, Drizzle ORM + Postgres (Neon), Upstash Redis, R2 (Cloudflare), argon2id, AES-256-GCM (KEK), GeniusPay, n8n/Resend, Zod.
- **Méthode** : lecture manuelle des 98 route handlers + libs critiques, greps ciblés (secrets, SQL brut, logs), `git log -p` sur tout l'historique, `pnpm audit --prod`, lecture des tests (87 tests passent).

> **Avertissement opérationnel important** : plusieurs correctifs de sécurité existent dans le *working tree* mais **ne sont pas commités** (36 fichiers modifiés). Si le déploiement se fait depuis le HEAD `beeb1fd`, la faille **Critique n°1** (prise de contrôle de compte) est exploitable en production.

---

## Étape 1 — Cartographie

### Endpoints API par domaine (tous dans `app/api/v1/*`)

| Domaine | Endpoints | Mécanisme d'auth |
|---|---|---|
| **Auth** | `auth/login`, `auth/signup`, `auth/logout`, `auth/verify-email`, `auth/request-password-reset`, `auth/reset-password` | Public (obtention de session) |
| **Devis** | `quotes` (CRUD), `quotes/[id]/transition`, `quotes/[id]/pdf/download`, `quotes/[id]/pdf/regenerate` | Session / API key (`quotes:*`) |
| **Factures** | `invoices` (CRUD), `invoices/[id]/transition`, `invoices/[id]/pdf/download`, `invoices/[id]/pdf/regenerate` | Session / API key (`invoices:*`) |
| **Contrats** | `contracts` (CRUD), `contracts/[id]/transition`, `contracts/[id]/pdf/*`, `contracts/[id]/signed-pdf/download` | Session / API key (`contracts:*`) |
| **Clients** | `clients` (CRUD), `clients/[id]/archive`, `clients/[id]/unarchive`, `clients/[id]/invoices`, `clients/[id]/projects` | Session / API key (`clients:*`) |
| **Projets** | `projects` (CRUD), `projects/[id]/transition`, `projects/[id]/deliverables`, `projects/[id]/expenses`, `projects/[id]/members[/userId]`, `projects/[id]/profitability`, `projects/[id]/review-request` | Session / API key |
| **Paiements** | `billing/*` (subscribe, cancel, resume), `webhooks/geniuspay`, `webhooks/geniuspay-excellence` | Session + HMAC webhook |
| **Fichiers** | `uploads/presign`, `uploads/[id]/complete`, `files/[id]/download`, `files/[id]` | Session / API key (`files:*`) |
| **Admin** | `admin/dashboard`, `admin/finance`, `admin/organizations`, `admin/organizations/[id]/quota`, `admin/organizations/[id]/suspend` | Session super-admin (double vérification middleware + route) |
| **Portail client** | `portal/quotes/[id][/sign]`, `portal/contracts/[id][/sign]`, `portal/invoices/[id]`, `portal/deliverables/[id][/approve|/reject]`, `portal/reviews/[requestId]` | Token public `pt_*` lié ressource |
| **Org / équipe** | `organizations[/slug][/members][/invitations]`, `invitations/accept`, `api-keys` (CRUD + rotate), `me`, `user`, `team` | Session (`requireOrg`) |
| **Externe** | `openapi.json` (public), `verify/signature/[signatureId]` (public, rate-limité), `webhooks/excellence-events`, `webhooks/verify`, `internal/cron/webhook-retries` (CRON_SECRET) | HMAC / bearer |

### Fichiers manipulant des données sensibles

- `lib/db/schema.ts` — **IBAN/coordonnées bancaires** (`organizations.bankDetails`), mots de passe hachés, hashs de tokens, secrets webhooks, IPs.
- `lib/payments/credentials.service.ts` — chiffrement/déchiffrement des clés marchandes (KEK).
- `lib/payments/geniuspay/payment-intents.service.ts` — webhook paiement, données client (nom, email, téléphone) envoyées à GeniusPay.
- `lib/repositories/{quotes,invoices,contracts,clients,projects,expenses,deliverables}.repo.ts` — montants, données clients, événements webhooks sortants.
- `lib/webhooks/payload-builder.ts` — PII client + token public dans les URLs envoyées à n8n.
- `lib/audit/index.ts`, `lib/db/schema.ts:179` — audit logs (email, IP, metadata).
- `lib/signatures/sign.service.ts` — preuves de signature (email, IP, UA).
- `lib/api-keys/index.ts`, `lib/public-tokens/index.ts` — gestion des secrets/tokens.
- `middleware.ts` — point unique d'authentification des API.

---

## Étape 2 — Auth & autorisation

### Ce qui est bien fait (vérifié par lecture du code)

- **Toutes les routes métier** vérifient un scope (`checkScope`) ET passent par des repositories scopés par `organizationId` (`getInvoiceById(orgId, id)` filtre `organizationId` + `deleted_at IS NULL`). **Aucun IDOR cross-org par changement d'ID trouvé sur les routes devis/factures/contrats/clients/projets** (vérifié : `invoices/[id]/route.ts:38`, `quotes/[id]`, `routes.helper.ts:35-54`, `files/[id]/download/route.ts:23`, etc.).
- `x-organization-id` envoyé par le client est **validé contre une vraie appartenance** avant ré-injection (`middleware.ts:259-283`).
- Les en-têtes d'auth forgés par le client (`x-user-id`, `x-auth-type`, `x-is-super-admin`, …) sont **supprimés puis ré-écrits** par le middleware (`middleware.ts:23-35`).
- Sessions : token 256 bits aléatoire, stocké **haché SHA-256**, expiration 30 j, révocation (`revokedAt`), logout, et révocation de toutes les sessions au changement de mot de passe (working tree).
- API keys : hash SHA-256 + `timingSafeEqual`, expiration, révocation, rotation avec grâce 24 h.
- Tokens publics : hashés, liés `resourceType + resourceId` **+ email destinataire** (vérifié à la signature : `portal/quotes/[id]/sign/route.ts:49`, `portal/contracts/[id]/sign/route.ts:73`), `maxUses` consommé atomiquement avec `FOR UPDATE`, expiration, révocation.
- Webhooks GeniusPay : pipeline 9 étapes — fenêtre de timestamp ±300 s, HMAC SHA-256, idempotence par `event_id` (contrainte unique), **re-fetch du paiement côté passerelle** + comparaison de montant (anti-spoofing, `payment-intents.service.ts:296-327`).
- Portail : le middleware refuse un token public hors des routes `/portal/...` (`middleware.ts:216-234`).

### Faiblesses identifiées (détail en fin de rapport)

| ID | Sévérité | Résumé |
|---|---|---|
| **C-1** | **Critique** | Token de reset de mot de passe **déterministe** (`reset-password-<userId>`) dans le code commité (HEAD) → prise de contrôle totale de n'importe quel compte. Corrigé dans le working tree, **non commité**. |
| **M-5** | Moyen | Token de vérification d'email déterministe (`verify-email-<userId>`), sans expiration ni enregistrement de demande. |
| **M-2** | Moyen | `x-forwarded-for` (spoofable) utilisé comme identité de rate-limiting IP partout. |
| **M-1** | Moyen | Aucun rate-limiting sur `/api/v1/auth/*` (login, signup, reset) — brute-force et DoS mémoire argon2. |
| **M-8** | Moyen | Sessions : pas de nettoyage des lignes expirées, cookie sans préfixe `__Host-`. |

---

## Étape 3 — Secrets & données sensibles

### Résultats des recherches (repo + historique git complet)

- `.env` **n'est pas commité** et est bien dans `.gitignore` (`/home/precieux/Projet/contravo/.gitignore:29,46`) ✔
- `git log --all -p` + recherche de toutes les valeurs réelles du `.env` : **aucune clé réelle n'a été trouvée dans l'historique** ✔
- `scratch/geniuspay.txt` (documentation API collée, clés placeholder `pk_live_xxx` uniquement) et `cookie.txt` (vide) sont **commités** — inutiles et à retirer (F-2).
- `.env` local : permissions **664 (groupe + autres lisibles)** alors qu'il contient des secrets de production : `PAYMENT_CREDENTIALS_KEK` (clé maîtresse des credentials marchands), `DATABASE_URL`/`POSTGRES_URL` (mot de passe Neon), clés R2, token Upstash, `CRON_SECRET`, et **clés live GeniusPay** (`GENIUS_LIVE_API_KEY`/`GENIUS_LIVE_SECRET_KEY` en commentaires, `.env:15-16`). → `chmod 600`, rotation des clés live, KEK à régénérer + ré-encryptage (`rotateAllCredentialsKek`).

### Chiffrement au repos

| Champ | Chiffré ? |
|---|---|
| `payment_gateway_credentials.api_secret_encrypted` + nonce | ✔ AES-256-GCM sous KEK (`credentials.service.ts:35-57`), échec bruyant si KEK absent (pas de fallback) |
| `organizations.bank_details` (**IBAN** et coordonnées bancaires) | ✘ **JSONB en clair** (`schema.ts:60`), exposé au portail client (`portal/invoices/[id]/route.ts:57,92`) |
| `webhook_endpoints.secret` | ✘ **en clair** (`schema.ts:245`) |
| `users.password_hash` | ✔ argon2id (memoryCost 19456, timeCost 2) |
| `api_keys.key_hash`, `public_tokens.token_hash`, `sessions.token_hash`, `invitations.token_hash`, `password_reset_tokens.token_hash` | ✔ SHA-256 |
| `payment_webhook_events.raw_payload` | ✘ JSONB en clair, conservé **indéfiniment** (`schema.ts:712`) |

---

## Étape 4 — Injections & validation

- **SQL** : 100 % Drizzle paramétré (`sql\`...\`` n'interpole que des colonnes ou des bindings). Aucune concaténation de chaîne dans les requêtes. ✔
- **Validation Zod** présente sur tous les formulaires (devis/factures : `updateInvoiceSchema` etc.). Points faibles :
  - Montants : `unitPriceCents` accepte **n'importe quel bigint** (négatif possible → facture à -X, `invoices/[id]/route.ts:12`), `quantity` est une chaîne parseée en `float` (NaN → 0). Pas de borne > 0. (É-5)
  - `createKeySchema.scopes` accepte n'importe quelle chaîne (`api-keys/route.ts:12`) — un membre peut demander n'importe quel scope non standard, mais `checkScope` restreint l'usage aux scopes connus. (Faible)
- **Uploads** : MIME whitelist + taille max + quota + vérif `Content-Length` + SHA-256. Mais :
  - L'« antivirus » sur le chemin upload client (`completeUpload`) est une **recherche de la chaîne EICAR seulement** (`upload-service.ts:303-315`) ; les heuristiques PDF/OLE de `antivirus.ts` ne sont utilisées que sur le chemin `uploadServerFile`. Pas de ClamAV malgré le commentaire du schéma. (É-4)
  - **`linkedEntityId` n'est jamais vérifié contre l'org** → voir É-2.
- **XSS/PDF** : le markdown des contrats est parsé par un mini-parser qui **stripe le HTML** (`lib/pdf/markdown.ts`), rendu via React PDF (pas de `dangerouslySetInnerHTML`). ✔

---

## Étape 5 — Dépendances (`pnpm audit --prod`)

Résultat : **2 critiques, 18 élevées, 11 modérées** (31 advisories).

| Paquet | Version | Sévérité | Fix | Note |
|---|---|---|---|---|
| `next` | 15.6.0-canary.59 | HIGH ×2 | ≥15.6.0-canary.61 (ou stable 15.5.x/16.x) | DoS RSC désérialisation (GHSA-5j59-xgg2-r9c4, GHSA-…RSC), DoS Image Optimizer CVE-2025-59471 (actif ici : `remotePatterns` défini dans `next.config.ts:9-14`) — **dépendance directe, runtime** |
| `drizzle-orm` | 0.43.1 | HIGH | ≥0.45.2 | **SQL injection via identifiants SQL mal échappés** — dépendance directe (l'app n'interpole pas d'identifiants utilisateur, risque pratique faible, mais à monter) |
| `tar` (via `@tailwindcss/oxide`) | ≤7.5.18 | **CRITICAL** + HIGH ×5 | ≥7.5.19 | Path traversal / symlink / DoS — build-time uniquement |
| `shell-quote` (via `drizzle-orm>gel`) | 1.8.3 | **CRITICAL** | ≥1.8.4 | Injection de commande par newline dans `quote()` — vecteur pratique faible |
| `sharp` (via `next`) | <0.35.0 | HIGH | ≥0.35.0 | CVEs libvips (CVE-2026-33327…) |
| `postcss` / `nanoid` | ≤8.5.22 / <3.3.18 | HIGH ×2 / ×2 | ≥8.5.23 / ≥3.3.18 | Lecture arbitraire de fichiers `.map`, DoS nanoid — build/runtime partiel |
| `esbuild` (via `drizzle-kit`) | ≤0.24.2 | MODERATE | ≥0.25.0 | Dev server CORS |

---

## Étape 6 — Conformité RGPD (analyse du code)

### Données personnelles stockées
`users` (email, nom), `clients` (email, téléphone, adresses), `signatures` (nom, email, **IP, user-agent**, dessin de signature), `audit_logs` (IP, metadata), `payment_webhook_events.raw_payload` (PII client, **sans purge**), `payment_intents` (IP), `sessions` (IP, UA), `quotes/contracts` (email/IP du signataire), fichiers R2 (PDF avec données client, canvas de signature).

### Flux vers des tiers (aucune gestion DPA/consentement dans le code)
1. **n8n** — reçoit les événements webhooks contenant PII client **et des URLs avec token public** (`payload-builder.ts:149`).
2. **Resend** — emails transactionnels (via n8n), PII client.
3. **GeniusPay** — nom, email, téléphone du client à chaque paiement (`payment-intents.service.ts:98-103`).
4. **Cloudflare R2** — documents (PII) ; **Upstash** — clés de rate-limit (orgId uniquement).
5. **HaveIBeenPwned API** — préfixe SHA-1 du mot de passe (k-anonymat, pas d'exfiltration du mot de passe) — OK RGPD.

### Durées de conservation / suppression
- **Aucun mécanisme de purge ou de durée de conservation** : tout est en suppression logique (`deletedAt`), y compris les données client et documents. Aucun job de purge, aucune suppression de compte utilisateur, aucun export (droit d'accès), aucun droit à l'effacement. (É-1, majeur pour une appli financière)
- `payment_webhook_events.raw_payload` conservé indéfiniment (É-1).
- Consentement : le checkbox `acceptedTerms` du portail contrat est **optionnel et non persisté** (`portal/contracts/[id]/sign/route.ts:15,65-70`).

### Logs contenant des données sensibles en clair
- `console.log` de tokens en dev uniquement (`request-password-reset/route.ts:75`, `organizations/[slug]/invitations/route.ts:85`) — protégés par `NODE_ENV !== 'production'`, mais un environnement de préprod oublié les expose. (F-3)
- `payment-intents.service.ts:325` log une alerte avec référence de transaction (non sensible).
- Aucun log de mot de passe ou de clé en clair trouvé. ✔

---

# Rapport des findings classés par criticité

---

## 🔴 CRITIQUE

### C-1 — Prise de contrôle totale de compte via token de reset déterministe (HEAD commité)

- **Fichier** : `app/api/v1/auth/reset-password/route.ts` **tel que commité au HEAD `beeb1fd`** (le working tree contient le correctif, NON commité — 36 fichiers modifiés).
- **Faille** : le token de reset est `reset-password-<userId>` : il se déduit de l'UUID de la victime. Aucun enregistrement de demande, aucune expiration, aucune consommation, aucun rate-limit (`request-password-reset/route.ts` commité ne fait que logguer en dev).
- **Chaîne d'exploitation concrète** :
  1. L'attaquant se connecte (ou crée un compte) et rejoint une org — ou obtient un UUID de victime par tout moyen (ex. membre d'une org).
  2. `GET /api/v1/organizations/:slug/members` (`members/route.ts:18-31`) expose **`users.id` de tous les membres, y compris aux rôles viewer** (`member.list` accordé à tous, `roles.ts:10`).
  3. `POST /api/v1/auth/reset-password` avec `{ "token": "reset-password-<uuidVictime>", "newPassword": "pwned" }` → 200, mot de passe changé.
  4. L'attaquant se connecte en tant que victime : devis, factures, **coordonnées bancaires (IBAN)**, contrats signés, clés API, webhooks — tout est accessible.
- **Correctif (déjà présent dans le working tree)** : token aléatoire 256 bits, stocké haché, monousage, TTL 1 h, révocation des demandes précédentes et des sessions (`reset-password/route.ts:20-69` + table `password_reset_tokens`).
- **Action** : ⚠️ **commiter et déployer le working tree immédiatement**, puis vérifier qu'aucun mot de passe n'a été réinitialisé via l'ancienne route (audit log `auth.password-reset-completed` sans `password-reset-requested` antérieur). Surveiller aussi `auth.login` suspects.
- **Sécurité en profondeur à ajouter** : ne plus exposer `users.id` dans `GET /organizations/:slug/members` (renvoyer l'id du membership, pas l'UUID utilisateur) et exiger un rôle pour lister les membres.

---

## 🟠 ÉLEVÉ

### É-1 — Aucune conformité RGPD « droit à l'effacement / conservation limitée »

- **Fichiers** : `lib/db/schema.ts` (toutes les tables), `lib/repositories/*` (suppressions logiques uniquement).
- **Faille** : pas de suppression physique ni d'anonymisation, pas de purge des `audit_logs`, `payment_webhook_events.raw_payload` (PII), `sessions`, `password_reset_tokens` expirés, fichiers R2 orphelins (le rollback de signature les supprime, mais pas les PDFs de devis/factures supprimés). Pas d'export des données d'un utilisateur, pas de suppression de compte, pas de consentement tracé.
- **Exploitation (juridique)** : une demande d'effacement (art. 17 RGPD) ne peut pas être honorée ; obligation de conservation fiscale (factures) vs effacement des données clients non facturées non arbitrée dans le code.
- **Correctif** :
```ts
// lib/db/retention.ts (exemple)
export async function purgeExpiredData(now = new Date()) {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));
  await db.delete(paymentWebhookEvents)
    .where(and(lt(paymentWebhookEvents.receivedAt, subDays(now, 90)), eq(paymentWebhookEvents.signatureValid, true)));
  // + anonymiser clients supprimés depuis > 12 mois (champs PII → NULL) via un cron CRON_SECRET
}
```
  Ajouter une route admin `POST /api/v1/admin/organizations/[id]/purge` et un job cron.

### É-2 — Liaison d'upload vers une entité d'une autre organisation (intégrité des documents)

- **Fichiers** : `app/api/v1/uploads/presign/route.ts:21-22` (accepte `linkedEntityType`/`linkedEntityId` arbitraires), `lib/storage/upload-service.ts:72-90` (`linkFileToEntityInTx` met à jour `quotes/contracts/invoices/deliverables/expenses` **sans vérifier `organizationId`**), appelé depuis `completeUpload` (`upload-service.ts:366-368`).
- **Faille** : tout utilisateur avec le scope `files:write` (un simple `member`, ou une API key) peut faire pointer `pdf_file_id` / `file_id` d'une entité vers **son propre fichier**, y compris pour une entité d'une autre organisation dont il connaîtrait l'UUID (les UUID d'entités circulent dans les URLs de portail partagées aux clients : `/portal/quotes/<id>?token=…`).
- **Exploitation concrète** : `POST /uploads/presign {kind:"quote_pdf", linkedEntityType:"quote", linkedEntityId:"<uuid devis victime>"}` → upload d'un PDF falsifié (conditions modifiées) → `POST /uploads/<id>/complete` → le devis de la victime sert désormais le PDF de l'attaquant. Intégrité documentaire compromise pour les clients, risque de fraude.
- **Correctif** :
```ts
// lib/storage/upload-service.ts — dans completeUpload() avant linkFileToEntityInTx()
if (file.linkedEntityType && file.linkedEntityId) {
  const [entity] = await db.select({ organizationId: entities[file.linkedEntityType].organizationId })
    .from(entities[file.linkedEntityType].table)
    .where(eq(entities[file.linkedEntityType].table.id, file.linkedEntityId)).limit(1);
  if (!entity || entity.organizationId !== orgId) {
    throw new ApiError('PERMISSION_DENIED', 'Linked entity not found in this organization', 403);
  }
}
```
  Idem à l'étape `presign` (vérifier l'entité dès la demande).

### É-3 — Pas de rate-limiting sur `/api/v1/auth/*` (brute-force + DoS)

- **Fichiers** : `middleware.ts:157-160` (les routes auth sont exemptées du middleware), `app/api/v1/auth/login/route.ts:11-56`, `signup`, `reset-password` (aucun appel `rateLimit`/`rateLimitIp`).
- **Faille** : un attaquant peut marteler `login` sans limite (argon2id = ~19 Mo + ~100 ms par tentative → **DoS mémoire/CPU** trivial à plusieurs connexions) et brute-forcer des mots de passe faibles (la politique min 12 caractères + HIBP réduit le risque, mais pas le DoS).
- **Correctif** :
```ts
// login/route.ts — en tête du handler
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
const rl = await rateLimitIp(ip, 10, 60_000); // 10 tentatives/min/IP
if (!rl.allowed) {
  return NextResponse.json({ error: 'rate_limit_exceeded', message: 'Trop de tentatives' }, { status: 429 });
}
```

### É-4 — « Antivirus » = détection EICAR seule sur le chemin d'upload client

- **Fichiers** : `lib/storage/upload-service.ts:303-315` (recherche de la chaîne EICAR), `lib/storage/antivirus.ts:7-99` (heuristiques utilisées seulement sur le chemin serveur), `lib/db/schema.ts:84` (commentaire « ClamAV » trompeur).
- **Faille** : un client du portail (ou un membre) peut déposer un PDF/Office malveillant dans les livrables ; il sera téléchargé par l'équipe. Aucun vrai scan antivirus.
- **Correctif** : brancher un vrai scanner (ClamAV via `clamscan`/`clamav-rest`, ou API tierce) dans `scanFileBuffer`, conserver les heuristiques en filet de sécurité, et logguer `file.infected_detected` (déjà prévu).

### É-5 — Validation incomplète des montants (factures/devis)

- **Fichiers** : `app/api/v1/invoices/[id]/route.ts:8-15`, `app/api/v1/quotes/route.ts` (schémas identiques), `lib/repositories/invoices.repo.ts:36-63`.
- **Faille** : `unitPriceCents` (bigint) accepte des valeurs négatives ; `quantity` est une chaîne libre parsée en `float` (→ `NaN`/0). Un membre peut créer une facture à montant négatif ou nul (total = 0 ou négatif), faussant la comptabilité et le suivi de paiement.
- **Correctif** :
```ts
const updateInvoiceItemSchema = z.object({
  // …
  quantity: z.string().regex(/^\d+(\.\d{1,3})?$/, 'Quantité invalide')
    .refine((v) => parseFloat(v) > 0),
  unitPriceCents: z.string().or(z.number()).transform((v) => BigInt(v))
    .refine((v) => v > 0n, 'Prix unitaire doit être positif'),
});
```
  Ajouter `totalCents >= 0` et `discountCents >= 0` dans les repositories.

### É-6 — Dépendances runtime vulnérables (Next canary + drizzle-orm)

- **Fichiers** : `package.json:39` (`next` 15.6.0-canary.59), `package.json:33` (`drizzle-orm` ^0.43.1), `next.config.ts:9-14` (`remotePatterns` → DoS Image Optimizer applicable).
- **Faille** : 2 DoS élevés Next.js (désérialisation RSC, HTTP requests), 1 SQLi élevé drizzle-orm (identifiants), actifs à l'exécution.
- **Correctif** : passer Next sur une version stable patchée (≥15.5.10/16.1.5, idéalement la dernière stable) ; `drizzle-orm` ≥0.45.2. Vérifier ensuite la compatibilité (PPR est expérimental et touché par des advisories — le désactiver si non indispensable).

---

## 🟡 MOYEN

### M-1 — Coordonnées bancaires (IBAN) en clair dans la base
- **Fichier** : `lib/db/schema.ts:60` (`bank_details` jsonb), exposées telles quelles au portail (`portal/invoices/[id]/route.ts:92`).
- **Correctif** : chiffrer avec le même mécanisme AES-256-GCM/KEK que `payment_gateway_credentials` (champs `bytea` + nonce), déchiffrer uniquement pour le rendu PDF/portail.

### M-2 — Secrets de webhooks en clair
- **Fichier** : `lib/db/schema.ts:245` (`webhook_endpoints.secret`).
- **Correctif** : stocker le hash HMAC du secret ou le chiffrer ; vérifier les signatures avec la valeur déchiffrée à la volée (pattern `credentials.service.ts`).

### M-3 — `x-forwarded-for` contrôlable par le client pour le rate-limiting
- **Fichiers** : `middleware.ts:172`, `lib/rate-limit/index.ts:108-144` (clés `ratelimit:ip:<ip>`).
- **Faille** : derrière un proxy qui ne surcharge pas `X-Forwarded-For`, un attaquant contourne les limites IP en faisant varier l'en-tête (webhooks 500/min, cron, login).
- **Correctif** : n'accepter l'IP que d'un proxy de confiance (configurer `app.set('trust proxy')` équivalent / normaliser l'IP en amont côté infra) et en dernier recours dédupliquer `ratelimit:ip:first-hop`.

### M-4 — Token public dans l'URL (fuite via historique, referers, logs)
- **Fichiers** : `middleware.ts:182-183` (accepte `?token=`), `lib/webhooks/payload-builder.ts:149` (`portalUrl` avec `?token=…`), emails n8n.
- **Correctif** : privilégier le header `Authorization: Bearer pt_…` côté client ; pour les emails, garder l'URL avec token mais ajouter `rel="noopener"`, et un mécanisme de rotation courte durée des tokens lus (déjà possible : `expiresInDays` + révocation).

### M-5 — Token de vérification d'email déterministe
- **Fichier** : `app/api/v1/auth/verify-email/route.ts:16-27` (`verify-email-<userId>`, sans expiration ni enregistrement).
- **Faille** : toute personne connaissant un UUID peut marquer l'email de la victime comme vérifié (impact fonctionnel faible aujourd'hui — la vérification n'est pas exigée au login — mais précédent dangereux).
- **Correctif** : même mécanisme que `passwordResetTokens` (table + hash + TTL) ; ou supprimer la route et vérifier l'email via le reset flow.

### M-6 — `.env` local lisible par le groupe/monde (664) avec secrets de production
- **Fichier** : `.env` (permissions `-rw-rw-r--`), contenant KEK, mot de passe DB, R2, Redis, `CRON_SECRET`, clés GeniusPay **live**.
- **Correctif** : `chmod 600 .env` ; ne jamais laisser de clés live en commentaire dans le fichier de dev ; **ruquer les clés live** (elles ont transité sur cette machine) ; KEK à tourner (`rotateAllCredentialsKek`) si exposé.

### M-7 — Données de paiement webhook conservées sans limite
- **Fichier** : `lib/db/schema.ts:712` (`payment_webhook_events.raw_payload` jsonb, PII client).
- **Correctif** : purge périodique (voir É-1) ou stockage des seuls champs utiles (référence, montant, statut), jamais le payload brut complet au-delà de 90 jours.

### M-8 — Sessions : pas de nettoyage, pas de révocation globale
- **Fichiers** : `lib/auth/session.ts:75-84` (glissement 30 j renouvelé sans limite), `lib/db/schema.ts:150-161`.
- **Correctif** : limite de durée absolue (ex. 90 j), purge des sessions expirées, cookie `__Host-session` + `secure` forcé même en dev ; prévoir une révocation administrative des sessions d'un utilisateur.

### M-9 — L'« antivirus » ne s'applique pas au flux complet des livrables clients
- Couvre É-4 côté serveur, mais les uploads `deliverable` passent par presign → `completeUpload` (scan EICAR seul). Voir É-4.

---

## 🟢 FAIBLE

- **F-1** — `lib/db/seed.ts:9` : mot de passe `admin123` en dur (script dev). Ne jamais lancer `db:seed` en production ; le marquer `dev-only` avec garde `NODE_ENV`.
- **F-2** — `scratch/geniuspay.txt` et `cookie.txt` commités (placeholders, mais à retirer du repo).
- **F-3** — Logs de tokens en dev (`request-password-reset/route.ts:75`, `invitations/route.ts:85,103`) : protégés par `NODE_ENV`, mais risque préprod.
- **F-4** — `shadcn`, `drizzle-kit`, `@types/*` dans `dependencies` (devDependencies attendu).
- **F-5** — Absence d'en-têtes de sécurité sur les réponses API (CSP, `X-Content-Type-Options`) ; `openapi.json` publie toute la surface d'attaque (accepté pour un SaaS public, mais documenter les scopes).
- **F-6** — `emailVerifiedAt` jamais exigé : un compte à email non vérifié peut utiliser le SaaS (risque de réputation/abus).
- **F-7** — `invitations/accept` ne vérifie pas que l'email du compte accepteur = email invité (le token est le bearer credential — acceptable, mais documenter le risque de transfert d'invitation).

---

## Synthèse des points positifs (à conserver)

1. Isolation multi-tenant solide : repositories systématiquement scopés `organizationId` + `checkScope` sur toutes les routes métier.
2. Tokens/sessions stockés hachés, révocation et expiration partout, `timingSafeEqual` pour les comparaisons.
3. Pipeline webhook GeniusPay exemplaire (HMAC + fenêtre temps + idempotence + re-fetch + vérification de montant).
4. Chiffrement AES-256-GCM des credentials marchands avec KEK hors-ligne, rotation supportée.
5. Portail client : token lié ressource + email destinataire, `maxUses` consommé atomiquement.
6. Validation Zod + schémas stricts, SQL 100 % paramétré.
7. Uploads : MIME whitelist, tailles, quotas, SHA-256, clés R2 vérifiées par tenant au téléchargement.
8. Middleware centralisé qui supprime les en-têtes forgés.

## Priorités d'action (ordre recommandé)

| # | Action | Sévérité |
|---|---|---|
| 1 | **Commiter + déployer le correctif reset-password du working tree** (C-1) | Critique |
| 2 | Remplacer le token `verify-email-<uuid>` (M-5) | Moyen |
| 3 | Corriger la liaison d'entité des uploads (É-2) | Élevé |
| 4 | Rate-limiting sur `/api/v1/auth/*` + IP de confiance (É-3, M-3) | Élevé |
| 5 | Mettre à jour Next (stable) et drizzle-orm (É-6) | Élevé |
| 6 | Vrai antivirus sur les uploads clients (É-4) | Élevé |
| 7 | Bornes positives sur montants/quantités (É-5) | Élevé |
| 8 | Chiffrer `bank_details` et `webhook_endpoints.secret` (M-1, M-2) | Moyen |
| 9 | Mécanisme RGPD : purge, effacement, export (É-1) | Élevé (conformité) |
| 10 | `chmod 600 .env` + rotation clés live/KEK (M-6) | Moyen |