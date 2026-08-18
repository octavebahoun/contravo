# Passage en production

L'ordre compte. Deux étapes dépendent de ce qui les précède, et les sauter
produit des pannes silencieuses — pas des erreurs.

---

## 1. Remise à zéro

```bash
npx tsx lib/db/purge.ts                    # simulation : montre ce qui partirait
npx tsx lib/db/purge.ts --yes --all-users  # exécute
```

Vide le schéma `public`, les objets R2 correspondants et **tous** les comptes,
jeu de démonstration compris. Deux choses survivent volontairement :

- **le journal de migration**, qui vit dans le schéma `drizzle` — `drizzle-kit
  migrate` considère donc toujours le schéma à jour ;
- **l'endpoint webhook `n8n_primary`**, sauvegardé et réinséré avec son secret.
  Sans lui, plus aucun évènement ne sort de l'application.

Ce qui ne survit pas et ne peut pas survivre : **la clé API de n8n**. Elle est
rattachée à une organisation (`organization_id` NOT NULL), et il n'y a plus
d'organisation. D'où l'étape 3.

> Irréversible. Les PDF déjà générés sont supprimés du bucket.

---

## 2. Créer le compte administrateur

S'inscrire normalement sur l'application. Ce premier compte devient propriétaire
de l'organisation. Dérouler la mise en route (`/onboarding`) jusqu'au bout — les
mentions légales et les coordonnées bancaires saisies là sont **imprimées sur
chaque facture**. Les laisser vides produit des documents sans valeur
juridique et sans RIB pour payer.

---

## 3. Émettre la clé de n8n

```bash
npx tsx lib/db/bootstrap-n8n-key.ts --yes
```

Affiche une fois un `sk_live_…`. À coller dans **n8n → Credentials →
`EXCELLENCE_API_KEY` → Value** :

```
Bearer sk_live_…
```

**C'est le maillon qui se casse sans bruit.** Le routeur n8n ne peut pas
vérifier la signature HMAC lui-même — son bac à sable n'a ni `crypto` ni
`process.env` — donc il renvoie chaque évènement à Contravo. Sans clé valide,
il reçoit l'évènement, répond 200 à Contravo (qui note « livré avec succès »),
puis se fait refuser en 401 et meurt. Aucun email ne part, et **rien dans
l'application ne le signale**.

Vérification : envoyer un devis, puis regarder les exécutions n8n. Le workflow
`Router Dispatch v1` doit être en `success`.

---

## 4. Sortir Resend du bac à sable

Tant que l'expéditeur est `onboarding@resend.dev`, Resend ne livre **qu'au
titulaire du compte**. Les clients ne reçoivent rien.

1. resend.com/domains → ajouter `send.excellenceteam.site` (sous-domaine
   recommandé : la ligne SPF de la boîte `contact@` n'est pas touchée, et la
   réputation des envois automatiques reste séparée de celle du courrier
   humain).
2. Ajouter le DKIM fourni.
3. **SPF : fusionner, ne jamais ajouter une seconde ligne.** Deux
   enregistrements `v=spf1` sur un domaine s'annulent, et tout le courrier
   part en spam — y compris celui écrit à la main.
4. DMARC en observation d'abord : `v=DMARC1; p=none;
   rua=mailto:contact@excellenceteam.site`. Durcir en `quarantine` puis
   `reject` seulement après lecture des rapports.
5. Remplacer le `from` dans les workflows n8n `email_*`.

État actuel du domaine (constaté) : MX chez PrivateEmail, SPF
`include:spf.privateemail.com`, **aucun DMARC**, zone chez Namecheap.

---

## 5. Basculer GeniusPay en réel

Quatre variables, dans `.env` **et** dans Vercel → Settings → Environment
Variables :

| Variable | Valeur |
|---|---|
| `EXCELLENCE_GENIUSPAY_API_KEY_PUBLIC` | la clé publique `pk_live_…` |
| `EXCELLENCE_GENIUSPAY_API_SECRET` | la clé secrète `sk_live_…` |
| `EXCELLENCE_GENIUSPAY_WEBHOOK_SECRET` | le secret webhook du compte |
| `EXCELLENCE_GENIUSPAY_ENV` | `live` |

> **L'URL de l'API est la même en bac à sable et en réel.** Ce sont les clés,
> et elles seules, qui décident. `EXCELLENCE_GENIUSPAY_ENV` ne change aucun
> appel — le client refuse désormais de démarrer si les deux se contredisent,
> plutôt que d'encaisser en simulation pendant qu'on croit être en production.

Déclarer aussi l'adresse de notification dans les réglages du compte :

```
https://contravo-7g6p.vercel.app/api/v1/webhooks/geniuspay-excellence
```

Sans elle, un client paie son abonnement et son forfait ne change jamais.

Les identifiants GeniusPay **de l'organisation** (ceux qui encaissent ses
factures clientes) sont saisis séparément dans les paramètres de l'application ;
ils sont chiffrés en base et la purge les a emportés.

---

## 6. Vérifier, dans cet ordre

| Quoi | Comment | Signe que c'est bon |
|---|---|---|
| Inscription | créer le compte | redirection vers `/onboarding` |
| Documents | émettre un devis | numéro `DEV-2026-0001`, mentions légales présentes sur le PDF |
| Emails | envoyer ce devis | exécution n8n `success` **et** mail reçu |
| Abonnement | « Passer à Pro » | une page GeniusPay s'ouvre |
| Encaissement | payer | facture passée à `paid`, montant net enregistré |

Un devis envoyé sans mail reçu = étape 3 ou 4 incomplète. Un « Passer à Pro »
qui ne redirige pas = étape 5 incomplète.

---

## Le plafond

Le compte GeniusPay observé plafonne à **500 000 XOF encaissés par mois**,
commission 1,5 %. Comme abonnements et factures clientes partagent le même
compte — GeniusPay ne propose pas encore le multi-compte, voir
`doc/COMPTE-EXCELLENCE.md` — cette enveloppe est commune. À faire relever avant
d'ouvrir les inscriptions payantes.
