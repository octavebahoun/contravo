# Ouvrir le compte GeniusPay qui encaisse les abonnements

Ce document sert une seule fois : le jour où l'on ouvre le compte marchand qui
reçoit l'argent des abonnements Contravo. Il n'y a rien à comprendre du code
pour le suivre.

## Pourquoi un deuxième compte

Il y a deux flux d'argent, et ils ne doivent jamais se croiser.

| | Qui paie | Qui reçoit | Où sont les clés |
|---|---|---|---|
| **Compte des organisations** | Les clients d'une agence | L'agence | Chiffrées en base, une ligne par organisation |
| **Compte Excellence** | Les agences abonnées à Contravo | Nous | Variables d'environnement `EXCELLENCE_GENIUSPAY_*` |

Aujourd'hui les deux pointent sur le **même compte sandbox**, uniquement pour
que le parcours de paiement soit testable. En production, l'argent des
abonnements arriverait sur le compte qui sert aux factures clients : c'est ce
que ce document sert à corriger.

## Ce qu'il faut récupérer

Sur le nouveau compte, dans **Paramètres → API**, trois valeurs :

| Valeur affichée par GeniusPay | Variable à renseigner |
|---|---|
| Clé publique (`sk_...`) | `EXCELLENCE_GENIUSPAY_API_KEY_PUBLIC` |
| Clé secrète (`ss_...`) | `EXCELLENCE_GENIUSPAY_API_SECRET` |
| Secret de webhook | `EXCELLENCE_GENIUSPAY_WEBHOOK_SECRET` |

Plus une quatrième, écrite à la main : `EXCELLENCE_GENIUSPAY_ENV`, qui vaut
`sandbox` tant qu'on teste et `live` le jour de la bascule.

> Les préfixes annoncés par la documentation PDF (`pk_` / `sk_`) ne
> correspondent pas à ce que la plateforme délivre réellement (`sk_` / `ss_`).
> Se fier à l'ordre d'affichage — publique d'abord, secrète ensuite — pas au
> préfixe.

## L'adresse à déclarer côté GeniusPay

Dans les réglages de webhook du nouveau compte :

```
https://contravo-7g6p.vercel.app/api/v1/webhooks/geniuspay-excellence
```

C'est par là que la passerelle prévient qu'un abonnement a été payé. Sans elle,
le client paie et son forfait ne change jamais.

## Les trois endroits où poser les clés

1. **`.env`** — la machine de développement.
2. **Vercel → Settings → Environment Variables** — le site en ligne. Les quatre
   variables, sur les environnements Production et Preview.
3. Nulle part ailleurs. Ces valeurs ne vont jamais dans un fichier suivi par
   git.

## Vérifier que ça marche

Sur la page Facturation, cliquer « Passer à Pro ». Trois issues possibles :

- **Une page GeniusPay s'ouvre** — c'est bon.
- **« Le paiement des abonnements n'est pas encore configuré »** — les clés
  manquent à l'endroit d'où l'on clique.
- **« Échec de l'initialisation du paiement : … »** — les clés sont là, la
  passerelle refuse. Le message qui suit vient d'elle et dit pourquoi.

Ce qui ne peut plus arriver, c'est le symptôme d'origine : l'adresse qui change
et la page qui revient à l'identique.

## Le plafond

Le compte sandbox actuel est limité à **500 000 XOF par mois**, commission
1,5 %. À 15 000 XOF l'abonnement Pro, cela plafonne à une trentaine
d'abonnements mensuels. À vérifier sur le compte de production avant d'ouvrir
les inscriptions payantes.
