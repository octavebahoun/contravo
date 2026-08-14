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

## Variables d'environnement n8n

À définir sur l'instance n8n (*Settings → Variables*, ou variables d'env du
conteneur). Aucune ne doit apparaître dans les JSON versionnés.

| Variable | Utilisée par | Valeur |
|---|---|---|
| `N8N_EXCELLENCE_WEBHOOK_SECRET` | router (vérif HMAC) | Le `secret` de la row `webhook_endpoints` créée côté Excellence (format `whsec_...`). Doit correspondre exactement. |
| `EXCELLENCE_API_BASE` | healthcheck | Base de l'API Excellence, ex. `https://app.contravo.io` |
| `EXCELLENCE_API_KEY` | healthcheck, `Fetch PDF` | Clé API Excellence (`sk_live_...`) scopée lecture seule. **Valeur brute, sans `Bearer`** : les workflows ajoutent le préfixe. |
| `RESEND_API_KEY` | les 13 workflows email | Clé Resend (`re_...`). **Valeur brute, sans `Bearer`**. |
| `RESEND_FROM` | les 13 workflows email | Expéditeur vérifié, ex. `Contravo <no-reply@notifications.contravo.io>` |
| `EXCELLENCE_ENV` | healthcheck | `staging` ou `prod` |
| `N8N_ALERT_WEBHOOK` | healthcheck | URL webhook Slack pour les alertes. |

Le secret HMAC n'est pas une variable d'env côté Excellence : il est stocké en
base dans `webhook_endpoints.secret` et généré à la création de l'endpoint.

## Importer en local

1. Lancer une instance n8n locale (`npx n8n` ou Docker).
2. Importer chaque fichier de `workflows/` via *Workflows → Import from File*.
3. Définir les variables ci-dessus.
4. Après import manuel, les nodes *Execute Sub-workflow* du router doivent être
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
