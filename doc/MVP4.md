# Étape 4 — Stockage Cloudflare R2 & Génération PDF

**Dev assigné :** Dev 4
**Prérequis :** Étape 3 mergée sur `main` (les entités ont déjà leurs colonnes `*_r2_key`).
**Durée estimée :** 6-8 jours
**Objectif :** Remplacer tous les stubs `501 NOT_IMPLEMENTED_YET` de l'Étape 3 par un vrai système de fichiers : uploads clients (livrables, reçus, pièces jointes), génération PDF automatique (devis, contrats, factures) et cachet cryptographique de signature sur les contrats signés via le portail.

**Livrable final :** un pipeline complet où chaque document métier a son PDF en R2, chaque signature portail produit un PDF cacheté avec preuve d'intégrité, et chaque upload passe par des URLs signées à durée limitée. Aucun octet ne transite jamais en direct par le serveur Next.js pour les gros fichiers.

> ⚠️ **Prérequis obligatoire :** lire et appliquer [`standards-dev.md`](./standards-dev.md).

---

## 1. Portée exacte

### 1.1 Inclus
- Bucket R2 unique multi-tenant avec préfixe strict `org/<org_id>/...`.
- Génération PDF serveur pour devis, factures, contrats (templates React → PDF via Puppeteer ou React-PDF).
- Signature portail : rendu canvas côté client + composition PDF cacheté côté serveur avec hash SHA-256 + timestamp + IP.
- URLs signées R2 (presigned) pour upload direct client → R2 et download temporaire.
- Pièces jointes : livrables (fichiers du projet), reçus de dépenses.
- Antivirus (scan à l'upload) via ClamAV ou équivalent hébergé.
- Quotas de stockage par org (préparation billing Étape 6, valeurs figées MVP).

### 1.2 Exclus (autres étapes)
- Envoi d'email avec PDF en pièce jointe → **Étape 5 (n8n)**.
- OCR sur reçus de dépenses → post-MVP.
- Prévisualisation de fichiers non-PDF dans le portail → post-MVP.
- CDN public pour images de marque → post-MVP.

---

## 2. Configuration R2

### 2.1 Buckets

Un **seul bucket** par environnement, jamais un bucket par org (limites Cloudflare + coût opérationnel) :

| Env | Bucket | Domain |
|---|---|---|
| Local | `excellence-dev-<pseudo>` | R2 dev key |
| Preview | `excellence-preview` | Auto |
| Staging | `excellence-staging` | `files.staging.excellence.app` |
| Prod | `excellence-prod` | `files.excellence.app` |

Bucket **privé** (pas de public URL). Tout accès passe par presigned URL générée serveur.

### 2.2 Convention de nommage des clés

```
org/<org_id>/quotes/<quote_id>/quote-<number>.pdf
org/<org_id>/contracts/<contract_id>/contract-<number>.pdf
org/<org_id>/contracts/<contract_id>/contract-<number>-signed.pdf
org/<org_id>/invoices/<invoice_id>/invoice-<number>.pdf
org/<org_id>/deliverables/<deliverable_id>/<original_filename>
org/<org_id>/expenses/<expense_id>/receipt-<ulid>.<ext>
org/<org_id>/signatures/<contract_id>/canvas-<ulid>.png
```

**Règle absolue :** aucune clé R2 ne peut être générée ou consommée sans passer par le helper `r2Key(orgId, ...)` qui préfixe et valide. Grep CI qui interdit `s3Client.send(...)` en dehors du module `/lib/storage`.

### 2.3 Isolation multi-tenant côté R2

- Chaque presigned URL est générée pour une clé **explicitement préfixée** par `org/<current_org_id>/`.
- Le helper `presignGet(key)` vérifie que `key.startsWith('org/' + ctx.organization.id + '/')` — refuse sinon (defensive coding, ne devrait jamais arriver).
- Bucket policy R2 : lecture/écriture uniquement via credentials serveur, jamais d'accès anonyme.

### 2.4 Cycle de vie

Lifecycle rules R2 :
- Signatures canvas brutes (`org/*/signatures/*`) : suppression auto après 90 jours (le PDF cacheté final suffit à la preuve).
- Documents des orgs soft-deleted : suppression physique 30 jours après `organizations.deleted_at`.
- Uploads incomplets (multipart abandonnés) : cleanup 24h.

---

## 3. Nouvelles tables

### 3.1 Fichiers (traçabilité et métadonnées)

```
files
  id                  uuid PK
  organization_id     uuid FK → organizations(id) ON DELETE CASCADE
  r2_key              text UNIQUE NOT NULL
  filename            text NOT NULL              (nom d'origine côté client)
  mime_type           text NOT NULL
  size_bytes          bigint NOT NULL
  sha256              text NOT NULL              (calculé serveur après upload)
  kind                text NOT NULL              (enum: 'quote_pdf'|'contract_pdf'|'contract_signed_pdf'|'invoice_pdf'|'deliverable'|'expense_receipt'|'signature_canvas'|'attachment')
  status              text NOT NULL              (enum: 'uploading'|'scanning'|'clean'|'infected'|'ready'|'failed')
  scan_result         jsonb NULL                 (résultat ClamAV : {virus_name, scanned_at})
  linked_entity_type  text NULL                  (quote|contract|invoice|deliverable|expense)
  linked_entity_id    uuid NULL
  uploaded_by_user_id uuid FK → users(id) NULL   (null si généré serveur ou upload portail)
  uploaded_via        text NOT NULL              (enum: 'server_generated'|'session'|'api_key'|'public_token')
  uploaded_from_ip    inet NULL
  created_at          timestamptz DEFAULT now()

  INDEX idx_files_org_kind ON files(organization_id, kind, created_at DESC)
  INDEX idx_files_entity ON files(linked_entity_type, linked_entity_id)
  UNIQUE(organization_id, r2_key)
```

**Règle :** chaque entité métier référence les fichiers via `files.id` (nouvelle colonne `pdf_file_id`, `signed_pdf_file_id`, etc.). Les colonnes `*_r2_key` de l'Étape 3 deviennent obsolètes et sont migrées vers `pdf_file_id` (migration incluse dans cette étape).

### 3.2 Signatures (preuve juridique renforcée)

```
signatures
  id                  uuid PK
  organization_id     uuid FK
  entity_type         text NOT NULL              (enum: 'contract'|'quote')
  entity_id           uuid NOT NULL
  signer_name         text NOT NULL
  signer_email        text NOT NULL
  signer_ip           inet NOT NULL
  signer_user_agent   text NOT NULL
  public_token_id     uuid FK → public_tokens(id) NOT NULL
  canvas_file_id      uuid FK → files(id) NULL   (PNG du tracé — peut être null pour "clic pour signer")
  signed_pdf_file_id  uuid FK → files(id) NOT NULL
  document_sha256     text NOT NULL              (hash du PDF avant cachet)
  signature_sha256    text NOT NULL              (hash du signer_email || iso_ts || document_sha256)
  signed_at           timestamptz NOT NULL DEFAULT now()
  otp_verified        boolean DEFAULT false      (préparation OTP renforcé, false au MVP)

  INDEX idx_signatures_entity ON signatures(entity_type, entity_id)
```

Cette table est **immuable** — pas de policy UPDATE ni DELETE (révocation des privilèges DB en prod).

### 3.3 Quotas de stockage (préparation billing)

```
storage_usage
  organization_id     uuid PK FK → organizations(id) ON DELETE CASCADE
  total_bytes         bigint NOT NULL DEFAULT 0
  file_count          integer NOT NULL DEFAULT 0
  last_computed_at    timestamptz DEFAULT now()
```

Mis à jour via trigger sur `files` (INSERT +size, DELETE -size). Limite MVP figée : 5 Go par org, dépassement bloque les uploads (403 `STORAGE_QUOTA_EXCEEDED`). Ajustable par plan en Étape 6.

---

## 4. Flow d'upload — 3 canaux

### 4.1 Upload direct client → R2 (recommandé pour fichiers > 1 Mo)

```
1. Client (SaaS ou portail) : POST /api/v1/uploads/presign
     body: { kind, filename, mimeType, sizeBytes, linkedEntityType, linkedEntityId }
     → serveur valide (quota, mime whitelist, size max, permission sur l'entité)
     → crée row `files` status='uploading'
     → renvoie { fileId, uploadUrl (PUT presigned 10min), maxSize, requiredHeaders }

2. Client : PUT direct sur uploadUrl (bytes → R2)

3. Client : POST /api/v1/uploads/:fileId/complete
     → serveur HEAD sur R2 pour vérifier taille réelle == sizeBytes déclaré
     → calcule SHA-256 en streaming
     → lance scan antivirus (§5)
     → si clean : status='ready', trigger éventuel (ex: attacher à un deliverable)
     → renvoie file metadata
```

**Sécurité upload direct :**
- Presigned URL valide 10 minutes, méthode PUT uniquement, `Content-Length` et `Content-Type` figés dans la signature.
- MIME whitelist stricte par `kind` (voir §4.4).
- Refus si `sizeBytes > limits[kind]`.
- Si `complete` jamais appelé après 30 min → status passe `failed`, fichier R2 supprimé.

### 4.2 Upload serveur (petits fichiers < 1 Mo, ex: signature canvas)

```
POST /api/v1/uploads (multipart)
  → serveur reçoit le body, scan, upload R2, crée files row
```

Réservé aux petits fichiers pour éviter d'engorger le serveur.

### 4.3 Génération serveur (PDF)

```
Trigger métier (ex: POST /quotes/:id/send)
  → renderQuotePdf(quoteId)
  → hash SHA-256
  → PUT R2
  → INSERT files (status='ready', uploaded_via='server_generated')
  → link quote.pdf_file_id = file.id
```

### 4.4 MIME whitelist par kind

| Kind | MIME autorisés | Taille max |
|---|---|---|
| `deliverable` | `application/pdf`, `image/*`, `video/mp4`, `application/zip`, `application/vnd.openxmlformats-*`, `application/vnd.oasis.opendocument.*`, `text/*` | 500 Mo |
| `expense_receipt` | `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/webp` | 20 Mo |
| `signature_canvas` | `image/png` | 500 Ko |
| `attachment` (générique) | subset restreint, refus des exécutables | 50 Mo |

Tout upload avec un MIME hors whitelist → 415 `UNSUPPORTED_MEDIA_TYPE`. Le MIME réel est **re-vérifié** serveur via magic bytes (`file-type` npm) — refus si divergence avec le MIME déclaré (défense contre upload masqué).

---

## 5. Antivirus

- Tout fichier uploadé (upload direct ou serveur) passe par un scan avant `status='ready'`.
- MVP : ClamAV en sidecar (container Docker séparé) OU service tiers (Cloudmersive, VirusTotal API).
- Résultat stocké dans `files.scan_result`. Si infecté :
  - `status='infected'`
  - Fichier supprimé de R2 immédiatement.
  - Alerte à l'owner de l'org.
  - Audit log `file.infected_detected`.
- Timeout scan : 60s. Au-delà → status `failed`, retry manuel possible.

**PDFs générés serveur** : scan également obligatoire (défense contre chaîne de génération compromise).

---

## 6. Génération PDF — architecture

### 6.1 Stack

- **React-PDF** (`@react-pdf/renderer`) pour devis, factures — layouts déterministes, léger, sans headless browser.
- **Puppeteer + Chromium** (via `@sparticuz/chromium` en serverless si besoin) pour contrats — nécessite CSS riche, wrapping complexe, styles Markdown → HTML.
- Choix par doc figé, pas de mélange. Justification dans `docs/pdf-choices.md`.

### 6.2 Templates

Un template = un composant React versionné (`/lib/pdf/templates/quote-v1.tsx`, `invoice-v1.tsx`, `contract-v1.tsx`).

- Le numéro de version est stocké dans `files.metadata.template_version` — un re-rendu produit **le même PDF** octet-pour-octet (déterminisme requis pour les hashs de preuve).
- Un changement de template = nouvelle version (`quote-v2.tsx`), les documents existants gardent leur version d'origine.
- Templates paramétrables par org : logo, couleur d'accent, mentions légales, coordonnées bancaires. Table `organizations` étendue :

```
organizations
  + logo_file_id       uuid FK → files(id) NULL
  + brand_color        text NULL           (hex, default #2B6CE5)
  + legal_mentions     text NULL           (footer PDF)
  + bank_details       jsonb NULL          (IBAN, BIC, mobile money numbers pour factures)
```

### 6.3 Déterminisme

- **Aucune donnée dynamique** dans le rendu (pas de `Date.now()`, pas de random). Toute date affichée vient des colonnes DB (`issue_date`, `created_at`, etc.).
- **Fonts** : embarquées dans le repo (`/lib/pdf/fonts/`), pas de fetch réseau au render.
- **Images** (logo org, signature) : téléchargées depuis R2, hashées, embarquées base64 dans le PDF.
- **Test de déterminisme** en CI : générer le même devis 5 fois → SHA-256 identiques.

### 6.4 Contenu par document

**Devis / Facture :**
- Header : logo org, coordonnées org (bank_details pour factures)
- Bloc destinataire : client (nom, adresse)
- Métadonnées : numéro, date d'émission, échéance/validité
- Tableau des items : description, qty, unit_price, discount, amount
- Totaux : subtotal, discount, TVA (avec taux), total
- Notes + terms
- Footer : legal_mentions, pagination

**Contrat :**
- Header + logo
- Body : rendu du `contracts.body_markdown` en HTML/CSS riche
- Bloc parties : org (signataire) + client (signataire)
- Zone signature (vide si non signé, cachet si signé — voir §7)
- Footer : legal_mentions, ID contrat, page X/Y

---

## 7. Signature portail — pipeline cryptographique

### 7.1 Frontend portail

```
1. Client ouvre /portal/contracts/:id?token=pt_...
2. Voit le PDF non signé (iframe sur presigned URL)
3. Case à cocher "J'accepte les termes" (obligatoire)
4. Composant Canvas : trace sa signature à la souris/tactile
5. Confirmation email (rappel Étape 2 §3.5) : retape l'email destinataire
6. Bouton Signer → POST /portal/contracts/:id/sign
     body: { signerName, signerEmail, signatureCanvasBase64 }
```

### 7.2 Backend — pipeline (transaction unique)

```
1. Valider token (action 'sign', non expiré, email match)
2. Valider entité (contract.status == 'sent', pas déjà signé)
3. Upload canvas PNG → R2 → INSERT files (kind='signature_canvas')
4. Récupérer PDF original (files.sha256 → document_sha256)
5. Composer PDF signé :
     - Charger PDF original
     - Ajouter page "Certificat de signature" ou zone dédiée avec :
        * Signature (canvas image)
        * Signer name, email, IP, timestamp ISO 8601 UTC
        * Hash du document original (SHA-256)
        * Hash de signature = SHA-256(signer_email || iso_ts || document_sha256)
6. Uploader PDF signé → R2 → INSERT files (kind='contract_signed_pdf')
7. INSERT signatures (immuable)
8. UPDATE contracts SET status='signed', signed_at=..., signed_pdf_file_id=..., signature_hash=...
9. Audit log + emit contract.signed (webhook sortant Étape 3)
```

Toute étape qui échoue → rollback complet (transaction DB + suppression fichiers R2 uploadés dans la transaction). Le contrat reste `sent`.

### 7.3 Preuve d'intégrité vérifiable

Un endpoint public `GET /api/v1/verify/signature/:signatureId` permet à tout tiers (avocat, tribunal) de vérifier :
- Le hash du PDF signé qu'il possède
- Le hash de signature
- La correspondance avec les métadonnées stockées

Retourne un JSON de preuve détaillé + éventuellement un PDF de vérification signé également. Documenté publiquement.

### 7.4 Limites juridiques MVP

- Signature = **signature électronique simple** au sens eIDAS (pas avancée ni qualifiée).
- Suffisant pour la majorité des contrats commerciaux ; ne pas prétendre équivalence avec signature manuscrite dans les documents marketing.
- Roadmap post-MVP : OTP email/SMS (préparé via `signatures.otp_verified`), puis intégration DocuSign / Yousign pour signature qualifiée.

`docs/legal/signature-scope.md` obligatoire, revu par un juriste avant activation prod.

---

## 8. Routes API — inventaire

### 8.1 Uploads (session, api_key selon scope, public_token pour livrables)

```
POST /api/v1/uploads/presign          { kind, filename, mimeType, sizeBytes, linkedEntityType, linkedEntityId }
POST /api/v1/uploads/:fileId/complete
POST /api/v1/uploads                  (multipart, petits fichiers)
GET  /api/v1/files/:fileId            (metadata seulement)
GET  /api/v1/files/:fileId/download   → 302 vers presigned GET R2 (5 min)
DELETE /api/v1/files/:fileId          (soft delete, cleanup R2 différé)
```

### 8.2 PDFs générés

```
POST /api/v1/quotes/:id/pdf/regenerate     (re-render si template mis à jour ou données modifiées en draft)
GET  /api/v1/quotes/:id/pdf/download       → 302 presigned
POST /api/v1/invoices/:id/pdf/regenerate
GET  /api/v1/invoices/:id/pdf/download
POST /api/v1/contracts/:id/pdf/regenerate  (uniquement draft)
GET  /api/v1/contracts/:id/pdf/download
GET  /api/v1/contracts/:id/signed-pdf/download  (uniquement si signed)
```

Note : `send()` (Étape 3) déclenche automatiquement `regenerate` avant l'envoi.

### 8.3 Portail

```
GET  /api/v1/portal/quotes/:id/pdf         (token action 'read')
GET  /api/v1/portal/contracts/:id/pdf
GET  /api/v1/portal/contracts/:id/signed-pdf
GET  /api/v1/portal/invoices/:id/pdf
POST /api/v1/portal/deliverables/:id/upload   (upload direct par le client, si autorisé)
GET  /api/v1/portal/files/:fileId/download    (générique, token doit couvrir le fichier)
```

### 8.4 Vérification

```
GET  /api/v1/verify/signature/:signatureId    (public, sans auth)
```

---

## 9. Sécurité — additions Étape 4

- [ ] Toutes les presigned URLs incluent `Content-Length` et `Content-Type` figés côté serveur.
- [ ] Durée presigned : 10 min upload, 5 min download standard, 60 min pour docs "à imprimer" (invoice, contract).
- [ ] Path traversal impossible : `filename` normalisé, jamais utilisé dans la clé R2 (ULID + extension uniquement pour les uploads clients).
- [ ] Content-Disposition sur download : `attachment; filename="..."` pour empêcher exécution dans le navigateur.
- [ ] Headers de réponse download : `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`.
- [ ] MIME magic bytes vérifiés (bibliothèque `file-type`), refus si divergence avec MIME déclaré.
- [ ] Scan antivirus bloquant avant `status='ready'`.
- [ ] SVG uploads : soit interdits, soit sanitizés (DOMPurify serveur) pour bloquer les XSS embarqués.
- [ ] PDF uploads : parsés pour détecter JavaScript embarqué → refus si présent.
- [ ] Quota `STORAGE_QUOTA_EXCEEDED` vérifié avant emission de la presign URL.
- [ ] Chiffrement au repos : R2 le fait par défaut, documenter que Cloudflare gère les clés.
- [ ] KEK PDF signés : le hash de signature doit être re-vérifiable sans clé secrète (transparence). Aucun chiffrement propriétaire des signatures.
- [ ] Rate limits :
  - Presign : 60/min/user
  - Upload complete : 60/min/user
  - PDF regenerate : 10/min/user
  - Download (session + api_key) : 300/min
  - Download (public_token) : 30/min
- [ ] Cross-tenant : test explicite qu'un file_id de l'org A ne peut pas être téléchargé via credentials de l'org B (via session, api_key, ou public_token).
- [ ] Signature canvas : ne jamais afficher tel quel sans re-encoding PNG (défense image polyglot).
- [ ] Audit log : `file.uploaded`, `file.deleted`, `file.infected_detected`, `pdf.generated`, `pdf.regenerated`, `signature.applied`.

---

## 10. Ce que Dev 4 ne fait PAS

- Pas d'envoi d'email avec PDF en pièce jointe (Étape 5).
- Pas de prévisualisation in-browser de fichiers Word/Excel (post-MVP).
- Pas d'OCR sur reçus.
- Pas de compression/transcoding vidéo.
- Pas de watermarking automatique des PDFs (juste le cachet signature).
- Pas de version signature qualifiée eIDAS (roadmap DocuSign/Yousign).

---

## 11. Structure code ajoutée

```
/apps/web/src
  /lib
    /storage
      r2-client.ts               # S3 SDK configuré pour R2
      r2-keys.ts                 # helper r2Key(orgId, ...) + validation
      presign.ts                 # presignPut / presignGet
      upload-service.ts          # cycle presign → complete → scan → ready
      antivirus.ts               # ClamAV client
      mime-guard.ts              # whitelist + magic bytes
    /pdf
      /templates
        quote-v1.tsx
        invoice-v1.tsx
        contract-v1.tsx          # Puppeteer template
      renderer.ts                # dispatch template → PDF
      determinism.ts             # helpers hash + fonts embarquées
      /fonts
        Inter-Regular.ttf, Inter-Bold.ttf, ...
    /signature
      canvas-normalizer.ts       # re-encode PNG sûr
      pdf-composer.ts            # assemble PDF signé + cachet
      hash.ts                    # SHA-256 helpers
      verifier.ts                # endpoint public /verify
    /files
      files.repo.ts
      files.service.ts
      quotas.service.ts
  /app/api/v1
    /uploads/...
    /files/...
    /quotes/[id]/pdf/...
    /invoices/[id]/pdf/...
    /contracts/[id]/pdf/...
    /contracts/[id]/signed-pdf/...
    /verify/signature/[id]/route.ts
    /portal
      /contracts/[id]/pdf/route.ts
      /contracts/[id]/signed-pdf/route.ts
      /invoices/[id]/pdf/route.ts
      /quotes/[id]/pdf/route.ts
      /deliverables/[id]/upload/route.ts
      /files/[id]/download/route.ts
  /tests
    /integration
      storage/
        presign-security.test.ts        # URL expire, mime figé
        cross-tenant-download.test.ts   # A ne peut jamais lire B
        quota-enforcement.test.ts
        mime-spoofing.test.ts           # PDF déguisé en JPEG refusé
      pdf/
        determinism.test.ts             # 5 rendus → même hash
        template-versions.test.ts       # ancien doc rend son ancienne version
      signature/
        end-to-end.test.ts              # portail → cachet → verify
        integrity-tamper.test.ts        # PDF modifié détecté par verify
        rollback-on-failure.test.ts     # une étape KO → rien de partiel
      antivirus/
        eicar.test.ts                   # fichier test EICAR détecté
```

---

## 12. Definition of Done — Étape 4

- [ ] Tous les stubs `501 NOT_IMPLEMENTED_YET` de l'Étape 3 remplacés par des implémentations réelles.
- [ ] Migration `*_r2_key` → `*_file_id` appliquée, données existantes migrées.
- [ ] Upload direct client → R2 fonctionne pour deliverable + expense receipt.
- [ ] Génération PDF déterministe testée en CI (5 rendus, hashs identiques).
- [ ] Rendu d'un devis, d'une facture, d'un contrat produit un PDF conforme visuellement (screenshot review dans PR).
- [ ] Signature portail end-to-end : contrat créé → send → portail sign → PDF cacheté → vérification via `/verify` OK.
- [ ] Test d'intégrité : modifier 1 octet du PDF signé → endpoint `/verify` détecte la divergence.
- [ ] Test cross-tenant : file_id org A jamais accessible par credentials org B (via 3 canaux).
- [ ] Test EICAR : upload d'un fichier de test antivirus → status `infected`, R2 nettoyé.
- [ ] Test MIME spoofing : PDF renommé `.jpg` avec MIME `image/jpeg` → refusé.
- [ ] Quota : org à 4.9 Go upload 200 Mo → refusé avec `STORAGE_QUOTA_EXCEEDED`.
- [ ] Vérification signature en documentation publique + JSON de preuve stable.
- [ ] `docs/pdf-choices.md`, `docs/signature-flow.md`, `docs/storage-conventions.md`, `docs/legal/signature-scope.md` à jour.
- [ ] Lint + typecheck + coverage ≥ 80%.

---

## 13. Livraison

Découpe en 3 PRs sur `feat/step4-storage-pdf` :
1. `feat/step4-r2-uploads` (R2 client, presign, files table, antivirus, quotas)
2. `feat/step4-pdf-generation` (templates devis/facture/contrat, déterminisme, regenerate)
3. `feat/step4-signature-flow` (canvas → PDF cacheté + `/verify` endpoint)

Review PR 3 : 2 relecteurs obligatoires (crypto + juridique). Après merge complet, Dev 5 (n8n) peut brancher les emails avec PDF en pièce jointe.