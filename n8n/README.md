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

## Importer en local

1. Lancer une instance n8n locale (`npx n8n` ou Docker).
2. Importer chaque fichier de `workflows/` via *Workflows → Import from File*.
3. Configurer les credentials n8n :
   - `N8N_EXCELLENCE_WEBHOOK_SECRET` (variable d'env du workflow router) = secret de l'endpoint `n8n_primary`.
   - `n8n API Key` (httpHeaderAuth) pointant vers l'API Excellence.
   - `Resend API Key` (PR2).

## Valider la structure

```bash
pnpm tsx n8n/scripts/lint.ts
```

## Déployer

Voir `DEPLOY.md`. En résumé :

```bash
N8N_API_BASE=https://n8n.excellence.app N8N_API_KEY=xxx pnpm tsx n8n/scripts/deploy.ts
```
