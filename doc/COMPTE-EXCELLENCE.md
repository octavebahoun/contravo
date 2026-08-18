# Le compte GeniusPay qui encaisse les abonnements

## La décision

GeniusPay ne propose pas encore plusieurs comptes marchands par utilisateur.
`doc/MVP6.md` §2 prévoyait un compte « Excellence » distinct de celui des
organisations ; il n'est pas ouvrable aujourd'hui. **Les abonnements passent
donc par le même compte que les transactions clientes**, et les quatre
variables `EXCELLENCE_GENIUSPAY_*` pointent volontairement sur les mêmes clés.

Ce n'est pas un contournement : rien n'est perdu ni confondu, parce que les deux
flux restent séparés partout où ça compte.

## Ce qui distingue les deux flux malgré le compte unique

| | Abonnements Contravo | Factures des organisations |
|---|---|---|
| Marqueur envoyé à la passerelle | `metadata.kind = 'saas_subscription'` | absent |
| Identifiants transportés | `org_id`, `cycle_id`, `attempt_id`, `plan_id` | `invoice_id` |
| Libellé sur le relevé | « Abonnement Contravo SaaS Pro » | le libellé de la facture |
| Où l'argent est enregistré | `subscription_cycles`, `subscription_payment_attempts` | `invoice_payments` |
| Webhook qui le traite | `/api/v1/webhooks/geniuspay-excellence` | le webhook de l'organisation |

Le handler d'abonnement écarte explicitement tout évènement dont les metadata ne
portent pas ce marqueur, et réciproquement. Chaque encaissement est horodaté et
rattaché à sa ligne : la relecture comptable reste possible, compte partagé ou
non.

## La conséquence à surveiller

Le plafond du compte est **partagé**. Aujourd'hui : 500 000 XOF encaissés par
mois, commission 1,5 %. Les paiements des clients des agences et les
abonnements consomment désormais la même enveloppe. À 15 000 XOF l'abonnement
Pro, une trentaine d'abonnements suffisent à la saturer — sans compter les
factures. C'est la limite à relever en premier, avant même d'ouvrir un second
compte.

## L'adresse à déclarer côté GeniusPay

Dans les réglages de webhook du compte :

```
https://contravo-7g6p.vercel.app/api/v1/webhooks/geniuspay-excellence
```

C'est par là que la passerelle prévient qu'un abonnement a été payé. Sans elle,
le client paie et son forfait ne change jamais.

## Le jour où le multi-compte arrive

Trois valeurs à recopier depuis **Paramètres → API** du nouveau compte :

| Valeur affichée par GeniusPay | Variable |
|---|---|
| Clé publique (`sk_...`) | `EXCELLENCE_GENIUSPAY_API_KEY_PUBLIC` |
| Clé secrète (`ss_...`) | `EXCELLENCE_GENIUSPAY_API_SECRET` |
| Secret de webhook | `EXCELLENCE_GENIUSPAY_WEBHOOK_SECRET` |

Plus `EXCELLENCE_GENIUSPAY_ENV`, écrit à la main : `sandbox` ou `live`.

> Les préfixes annoncés par la documentation PDF (`pk_` / `sk_`) ne
> correspondent pas à ce que la plateforme délivre réellement (`sk_` / `ss_`).
> Se fier à l'ordre d'affichage — publique d'abord, secrète ensuite — pas au
> préfixe.

À poser à deux endroits : `.env` en local, et Vercel → Settings → Environment
Variables pour le site en ligne. Nulle part ailleurs — jamais dans un fichier
suivi par git. Aucune ligne de code ne change.

## Vérifier

Sur la page Facturation, cliquer « Passer à Pro » :

- **Une page GeniusPay s'ouvre** — c'est bon.
- **« Le paiement des abonnements n'est pas encore configuré »** — les clés
  manquent à l'endroit d'où l'on clique.
- **« Échec de l'initialisation du paiement : … »** — les clés sont là, la
  passerelle refuse. Le message qui suit vient d'elle et dit pourquoi.
