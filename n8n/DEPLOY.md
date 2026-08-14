# Déploiement des workflows n8n

## Prérequis

- Une instance n8n accessible (staging puis prod).
- Une `N8N_API_KEY` avec les scopes `workflow:create` + `workflow:update`.
- Les credentials n8n configurés (voir README) : webhook secret, API key Excellence, Resend.

## Variables d'environnement

| Variable | Description |
|---|---|
| `N8N_API_BASE` | Base URL de l'instance, ex `https://n8n.excellence.app` |
| `N8N_API_KEY` | Clé API n8n |
| `N8N_WORKFLOWS_DIR` | Optionnel, défaut `./n8n/workflows` |

## Staging

```bash
N8N_API_BASE=https://n8n.staging.excellence.app \
N8N_API_KEY=$N8N_STAGING_API_KEY \
pnpm tsx n8n/scripts/deploy.ts
```

## Prod

```bash
N8N_API_BASE=https://n8n.excellence.app \
N8N_API_KEY=$N8N_PROD_API_KEY \
pnpm tsx n8n/scripts/deploy.ts
```

## Idempotence

Le script est idempotent : si un workflow de même `name` existe déjà, il est mis à jour (PUT), sinon créé (POST). Il est sûr de le relancer à chaque déploiement.

## Après déploiement

1. Activer les workflows (`active: true`) depuis l'UI ou via `POST /api/v1/workflows/:id/activate`.
2. Vérifier que le webhook `/excellence-events` répond (healthcheck).
3. Ne jamais éditer manuellement un workflow en prod hors procédure d'urgence documentée.
