# Templates emails (MJML)

Templates MJML des emails transactionnels, versionnés par nom de workflow.

```
/n8n/email-templates
  /<workflow_name>
    /fr
      subject.txt    # sujet avec placeholders {{...}}
      body.mjml      # corps MJML (compilé en HTML responsive)
    /en              # (post-MVP) même structure, langue anglaise
```

## Placeholders universels

- `{{org.name}}`, `{{org.logoUrl}}`, `{{org.brandColor}}`, `{{org.email}}`, `{{org.phone}}`
- `{{client.name}}`, `{{client.email}}`
- `{{portalUrl}}` — lien portail avec token public intégré
- `{{unsubscribeUrl}}` — lien de désinscription RGPD (obligatoire)

## Rendu

Les workflows n8n (PR2) compilent le MJML → HTML via un node Code (lib MJML) et
remplacent les placeholders avec les données du payload de l'event. MVP = FR uniquement
(`/fr`); la structure `/en` est prête pour activation post-MVP via `payload.recipient.locale`.

## Provider

Envoi via **Resend** (node HTTP Request → `https://api.resend.com/emails`).
Clé `RESEND_API_KEY` dans une variable d'environnement n8n (jamais en clair dans le JSON).
Expéditeur : `no-reply@notifications.excellence.app` (SPF/DKIM/DMARC à configurer côté Resend).
