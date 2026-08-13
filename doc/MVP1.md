# Étape 1 — Fondations Multi-Tenant

**Dev assigné :** Dev 1
**Durée estimée :** 4-6 jours
**Objectif :** Poser un socle multi-tenant sécurisé sur lequel les 4 autres devs pourront brancher leurs modules sans jamais casser l'isolation des données.

**Livrable final :** un repo Next.js exécutable où l'on peut créer une organisation, y ajouter des membres avec des rôles, et où **aucune requête DB ne peut échapper au filtre `organization_id`**.

---

## 1. Stack technique verrouillée

| Élément | Choix | Raison |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict | Imposé |
| DB | Neon PostgreSQL (branche `main` + branche `dev` par dev) | Imposé, branching gratuit |
| ORM | Drizzle ORM + `drizzle-kit` | Imposé, type-safe, migrations SQL lisibles |
| Validation | Zod (schemas partagés client/serveur) | Imposé |
| UI | Tailwind + shadcn/ui | Imposé |
| Package manager | pnpm | Monorepo-friendly, rapide |
| Node | 20 LTS | Stable |

**Interdits à cette étape :** aucun module métier (clients, projets, devis...). Uniquement l'infrastructure.

---

## 2. Schéma de base de données

### 2.1 Tables à créer

```
organizations
  id                uuid PK                (default gen_random_uuid())
  slug              text UNIQUE NOT NULL   (URL-safe, ex: "excellence-team")
  name              text NOT NULL
  created_at        timestamptz DEFAULT now()
  updated_at        timestamptz DEFAULT now()
  deleted_at        timestamptz NULL       (soft delete)

users
  id                uuid PK
  email             text UNIQUE NOT NULL   (citext recommandé)
  password_hash     text NOT NULL          (argon2id)
  full_name         text NOT NULL
  email_verified_at timestamptz NULL
  created_at        timestamptz DEFAULT now()
  updated_at        timestamptz DEFAULT now()

memberships                                 (relation N:N users ↔ orgs)
  id                uuid PK
  user_id           uuid FK → users(id) ON DELETE CASCADE
  organization_id   uuid FK → organizations(id) ON DELETE CASCADE
  role              text NOT NULL          (enum: owner|admin|member|viewer)
  invited_by        uuid FK → users(id) NULL
  joined_at         timestamptz DEFAULT now()
  UNIQUE(user_id, organization_id)

sessions                                    (auth par cookie httpOnly)
  id                uuid PK
  user_id           uuid FK → users(id) ON DELETE CASCADE
  token_hash        text UNIQUE NOT NULL   (on hash le token, jamais en clair)
  expires_at        timestamptz NOT NULL
  ip_address        inet NULL
  user_agent        text NULL
  created_at        timestamptz DEFAULT now()
  revoked_at        timestamptz NULL

invitations                                 (invitations par email)
  id                uuid PK
  organization_id   uuid FK → organizations(id) ON DELETE CASCADE
  email             text NOT NULL
  role              text NOT NULL
  token_hash        text UNIQUE NOT NULL
  expires_at        timestamptz NOT NULL   (7 jours max)
  accepted_at       timestamptz NULL
  invited_by        uuid FK → users(id)
  created_at        timestamptz DEFAULT now()

audit_logs                                  (traçabilité sécurité)
  id                uuid PK
  organization_id   uuid FK → organizations(id) NULL  (null si event global)
  actor_user_id     uuid FK → users(id) NULL
  action            text NOT NULL          (ex: "member.invited", "role.changed")
  target_type       text NULL              (ex: "user", "membership")
  target_id         uuid NULL
  metadata          jsonb DEFAULT '{}'
  ip_address        inet NULL
  created_at        timestamptz DEFAULT now()
```

### 2.2 Index obligatoires

```sql
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_org ON memberships(organization_id);
CREATE INDEX idx_sessions_user ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_audit_org_created ON audit_logs(organization_id, created_at DESC);
```

### 2.3 Rôles RBAC (source de vérité TypeScript)

```ts
// src/lib/rbac/roles.ts
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = typeof ROLES[number];

export const PERMISSIONS = {
  'org.delete':        ['owner'],
  'org.update':        ['owner', 'admin'],
  'member.invite':     ['owner', 'admin'],
  'member.remove':     ['owner', 'admin'],
  'member.role.change':['owner'],
  'member.list':       ['owner', 'admin', 'member', 'viewer'],
  // Les modules futurs (clients, projets...) ajouteront leurs perms ici
} as const;

export type Permission = keyof typeof PERMISSIONS;
```

---

## 3. Isolation multi-tenant — la règle sacrée

**Aucune requête ne doit jamais lire ou écrire de données métier sans un `WHERE organization_id = ?` explicite.**

### 3.1 Deux couches de défense

**Couche 1 — Repository wrapper (obligatoire)**

Aucun dev ne doit appeler `db.select().from(clients)` directement. Tous les accès passent par un wrapper qui injecte automatiquement `organization_id` :

```ts
// src/lib/db/tenant-db.ts
export function tenantDb(organizationId: string) {
  return {
    select: <T>(table: T) => db.select().from(table)
      .where(eq(table.organizationId, organizationId)),
    insert: <T>(table: T, values: any) => db.insert(table)
      .values({ ...values, organizationId }),
    // etc.
  };
}
```

Toute route API/serveur récupère un `tenantDb` via un helper `requireOrg()` et n'a **jamais accès au `db` brut**.

**Couche 2 — Row-Level Security PostgreSQL (défense en profondeur)**

Activer RLS sur toutes les tables métier futures. Même si un dev fait une erreur, Postgres refusera la requête :

```sql
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clients
  USING (organization_id = current_setting('app.current_org')::uuid);
```

Le middleware exécute `SET LOCAL app.current_org = '...'` au début de chaque transaction.

### 3.2 Test d'isolation obligatoire (CI)

Un test automatisé dans la CI qui :
1. Crée 2 orgs (A et B) avec 1 user chacune.
2. Insère des données pour A.
3. Tente de les lire en tant qu'user de B → **doit renvoyer 0 lignes**.
4. Tente une écriture cross-tenant → **doit échouer**.

Si ce test casse, le merge est bloqué.

---

## 4. Authentification (session-based, pas de JWT)

**Choix : cookies de session httpOnly + Secure + SameSite=Lax.** Pas de JWT côté client (attaques XSS, révocation impossible).

### 4.1 Flux

- **Signup :** email + password → hash argon2id (params : `memoryCost=19456, timeCost=2, parallelism=1`) → user créé, **pas d'org auto**.
- **Login :** vérif hash → génère `token` (32 bytes crypto random) → stocke `sha256(token)` en DB → set cookie `session=<token>`.
- **Middleware :** lit cookie → hash → cherche session non révoquée et non expirée → attache `user` au contexte.
- **Logout :** marque `revoked_at = now()`.
- **Session sliding :** si session > 7 jours restants, on prolonge à 30 jours. Max absolu : 90 jours.

### 4.2 Sécurité auth — checklist

- [ ] Rate limit login : 5 tentatives / 15 min / IP + 5 / 15 min / email
- [ ] Rate limit signup : 3 / heure / IP
- [ ] Password minimum : 12 caractères, check contre liste HaveIBeenPwned (API k-anonymity)
- [ ] Email de vérification obligatoire avant première invitation
- [ ] Token de reset password : 1h de validité, à usage unique, invalide toutes les sessions à l'usage
- [ ] Cookies : `httpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`
- [ ] Logout révoque **la session courante uniquement**. Bouton "déconnecter partout" révoque toutes.
- [ ] Header `Strict-Transport-Security` en prod

---

## 5. Middleware & contexte de requête

Chaque route API/serveur doit avoir accès à :

```ts
type RequestContext = {
  user: { id: string; email: string };
  organization: { id: string; slug: string; role: Role };
  db: TenantDb;              // db pré-scopée à l'org
  audit: (action: string, meta?: object) => Promise<void>;
};
```

Helper `requireOrg(orgSlug)` :
1. Vérifie session valide.
2. Vérifie que l'user a un `membership` actif dans l'org.
3. Retourne le contexte. Sinon → 401 ou 403.

Helper `requirePermission(perm)` : vérifie via table `PERMISSIONS` que le rôle actuel peut exécuter l'action.

---

## 6. Routes API à livrer (étape 1 uniquement)

Toutes sous `/api/v1/`, JSON, erreurs au format standardisé (voir §7).

```
POST   /auth/signup                   { email, password, fullName }
POST   /auth/login                    { email, password }
POST   /auth/logout
POST   /auth/verify-email             { token }
POST   /auth/request-password-reset   { email }
POST   /auth/reset-password           { token, newPassword }

POST   /organizations                 { name, slug }         → crée org + membership owner
GET    /organizations                 → liste des orgs de l'user
GET    /organizations/:slug           → détails
PATCH  /organizations/:slug           { name }               (admin+)
DELETE /organizations/:slug                                  (owner only, soft delete)

GET    /organizations/:slug/members                          → liste
POST   /organizations/:slug/invitations   { email, role }    (admin+)
GET    /organizations/:slug/invitations                      (admin+)
DELETE /organizations/:slug/invitations/:id                  (admin+)
POST   /invitations/accept                { token }          → crée membership

PATCH  /organizations/:slug/members/:userId   { role }       (owner only)
DELETE /organizations/:slug/members/:userId                  (owner ou soi-même)

GET    /me                            → user courant + orgs
```

**Pas d'API keys à cette étape.** Ce sera Étape 2 (Dev 2).

---

## 7. Format d'erreur standardisé (à figer dès maintenant)

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You cannot change roles in this organization.",
    "details": { "requiredRole": "owner" },
    "requestId": "req_01H..."
  }
}
```

Codes obligatoires : `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Toute erreur est loggée avec son `requestId` (ULID généré par middleware).

---

## 8. Sécurité — checklist non négociable

### 8.1 Secrets & config
- [ ] `.env.example` commité, `.env` **jamais** commité (vérif via git-secrets + pre-commit hook)
- [ ] Secrets prod dans variables d'environnement de l'hébergeur (Vercel/Cloudflare), pas dans le repo
- [ ] Rotation possible : `SESSION_SECRET`, `DATABASE_URL`, `INVITATION_TOKEN_SECRET`

### 8.2 Headers HTTP (via `next.config.ts`)
- [ ] `Content-Security-Policy` strict (nonce sur scripts inline)
- [ ] `X-Frame-Options: DENY`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy` minimal

### 8.3 Input & injection
- [ ] Zod sur **100% des inputs** (body, query, params) avec `.strict()`
- [ ] Drizzle uniquement, **jamais** de SQL raw sans `sql.placeholder` paramétré
- [ ] Slugs orgs : regex `^[a-z0-9][a-z0-9-]{2,49}$`, blacklist (`admin`, `api`, `www`...)
- [ ] Uploads : bloqués à cette étape (Étape 4)

### 8.4 CSRF
- [ ] Cookie `SameSite=Lax` couvre 90% des cas
- [ ] Pour actions sensitives (delete org, change role) : double submit token ou re-authentification password

### 8.5 Rate limiting
- [ ] Middleware global : 100 req/min/IP
- [ ] Endpoints auth : voir §4.2
- [ ] Stockage : Upstash Redis ou Cloudflare KV (choisir maintenant)

### 8.6 Audit log
- [ ] Toute action sensible écrit dans `audit_logs` : login, logout, création/suppression org, invitation, changement de rôle, reset password
- [ ] Immutable : pas d'UPDATE ni DELETE sur cette table (revoke privilege en prod)

### 8.7 Données personnelles
- [ ] Emails stockés en `citext`
- [ ] Suppression d'org : soft delete 30 jours puis purge (RGPD)
- [ ] Export des données utilisateur possible (endpoint `/me/export` — peut être stub étape 1)

---

## 9. Structure du repo

```
/apps/web                    # Next.js
  /src
    /app
      /api/v1/...
      /(auth)/login, /signup, /invitations/[token]
      /(app)/[orgSlug]/settings
    /lib
      /db          # drizzle client, tenant-db, schema/
      /auth        # sessions, password, tokens
      /rbac        # roles, permissions, requirePermission
      /validation  # zod schemas partagés
      /audit       # helper d'audit log
      /errors      # ApiError class, formatter
      /rate-limit
    /middleware.ts
  /drizzle         # migrations SQL générées
  /tests
    /integration   # tests isolation multi-tenant OBLIGATOIRES
/packages
  /types           # types partagés (Role, Permission, ApiError)
```

Monorepo pnpm workspaces. Turborepo optionnel mais recommandé.

---

## 10. Environnements

| Env | DB | Domaine | Usage |
|---|---|---|---|
| Local | Neon branch `dev-<pseudo>` | `localhost:3000` | Chaque dev sa branche |
| Preview | Neon branch auto par PR | `pr-XX.excellence.dev` | CI/CD |
| Staging | Neon branch `staging` | `staging.excellence.app` | Tests d'intégration |
| Prod | Neon branch `main` | `app.excellence.app` | Users réels |

---

## 11. Definition of Done — Étape 1

L'étape est validée **uniquement** si :

- [ ] Un user peut : s'inscrire, vérifier son email, créer une org, inviter un membre, changer un rôle, se déconnecter.
- [ ] Toutes les routes du §6 renvoient les bons codes HTTP et le format d'erreur §7.
- [ ] Le test d'isolation multi-tenant du §3.2 passe en CI.
- [ ] La checklist sécurité §8 est cochée à 100%.
- [ ] Les logs d'audit tracent les 6 événements clés (§8.6).
- [ ] Le README explique à un nouveau dev comment démarrer en < 10 min.
- [ ] Zero warning TypeScript, zero `any`, lint clean.
- [ ] Documentation `docs/architecture.md` avec le schéma DB + diagramme de flux auth.

---

## 12. Ce que Dev 1 ne fait PAS (interdictions explicites)

- Pas de clients, projets, devis, factures, contrats, avis — **rien de métier**.
- Pas d'API keys, pas de webhooks (Étape 2).
- Pas de R2 ni de PDF (Étape 4).
- Pas de n8n (Étape 5).
- Pas de OAuth, pas de SSO, pas de billing — **c'est le "sans refonte majeure" plus tard**.

Toute tentation d'ajouter un module métier "vite fait" est refusée en revue.

---

## 13. Livraison

- Branche `feat/foundations` → PR sur `main`.
- Review obligatoire par toi (Oktav) avant merge.
- Après merge : les Dev 2-5 peuvent démarrer leurs étapes en parallèle sur leurs branches respectives.