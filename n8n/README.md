# n8n — Automatisation Excellence

Ce dossier contient les workflows n8n versionnés de la plateforme Excellence (Étape 5 / MVP5).

## Structure

```
/n8n
  /workflows      # exports JSON des workflows n8n (un fichier = un workflow)
  /email-templates # templates MJML + sujets (PR2)
  /scripts        # deploy.ts (push vers l'API n8n), lint.ts (validation JSON)
  README.md       # ce fichier
  DEPLOY.md       # procédure de déploiement staging/prod
  TROUBLESHOOTING.md
```

## Principe

n8n est le **seul orchestrateur externe**. Il ne prend aucune décision métier :
- Excellence émet des events vers le webhook n8n (`POST /api/v1/webhooks/excellence-events`).
- n8n vérifie la signature HMAC, dispatche par `event`, puis appelle l'API Excellence en retour (`Bearer sk_live_...`) et envoie les emails (Resend).
- Voir `docs/adr/0007-n8n-orchestration.md` pour la décision structurante.

## Workflows PR1 (infrastructure)

| Fichier | Rôle |
|---|---|
| `router_dispatch_v1.json` | Webhook public unique. Vérifie HMAC, dispatch par event vers les sous-workflows. |
| `healthcheck_v1.json` | Cron 5 min → `/api/v1/me`. 3 échecs consécutifs → alerte. |
| `email_*_v1.json` (13) | Sous-workflows appelés par le router. Rendu du template MJML puis envoi Resend. |

## Configuration (aucune variable d'environnement requise)

Les nodes Code de n8n tournent dans un sandbox qui interdit `process.env`,
`require('crypto')` et le helper d'expression `hmac()`. Les workflows n'utilisent
donc **ni `$env` ni `$vars`** (ces dernières sont réservées aux plans payants).

**Secrets → credentials n8n** (chiffrés en base, conformes à la DoD §6). À créer
une fois via *Credentials → New → Header Auth* :

| Credential (nom exact) | Type | Header | Valeur |
|---|---|---|---|
| `RESEND_API_KEY` | Header Auth | `Authorization` | `Bearer re_...` |
| `EXCELLENCE_API_KEY` | Header Auth | `Authorization` | `Bearer sk_live_...` |

Le nom doit correspondre exactement : `deploy.ts` résout ces noms en IDs, qui
diffèrent d'une instance à l'autre.

**Valeurs non secrètes → node `Config`.** Le router et le healthcheck commencent
chacun par un node *Config* qui porte `apiBase` (et `environment` /
`alertWebhook` pour le healthcheck). C'est le seul endroit à éditer quand l'URL
change — utile en développement où l'URL de tunnel bouge à chaque redémarrage.

**Vérification HMAC.** Le sandbox empêchant tout calcul de HMAC côté n8n, le
router délègue à Excellence : il POST `{ signature, rawBody }` vers
`/api/v1/webhooks/verify`, qui répond `{ valid, event, payload }`. Le secret ne
quitte jamais Excellence (il vit dans `webhook_endpoints.secret`) et la
comparaison reste timing-safe.

## Importer en local

1. Lancer une instance n8n locale (`npx n8n` ou Docker).
2. Importer chaque fichier de `workflows/` via *Workflows → Import from File*.
3. Créer les 2 credentials ci-dessus et les rattacher aux nodes HTTP.
4. Renseigner `apiBase` dans le node *Config* du router et du healthcheck.
5. Après import manuel, les nodes *Execute Sub-workflow* du router doivent être
   re-pointés à la main sur les sous-workflows (les IDs sont propres à chaque
   instance). Le script `deploy.ts` fait cette résolution automatiquement —
   le préférer à l'import manuel.

## Valider la structure

```bash
pnpm tsx n8n/scripts/lint.ts
```

## Déployer

Voir `DEPLOY.md`. En résumé :

```bash
N8N_API_BASE=https://n8n.excellence.app N8N_API_KEY=xxx pnpm tsx n8n/scripts/deploy.ts
```
