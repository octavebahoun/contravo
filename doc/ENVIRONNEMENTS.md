# Environnements

Deux environnements, deux bases, une seule règle : **les bêta-testeurs ne
doivent jamais subir le développement en cours.**

## Vue d'ensemble

| | Production | Staging |
|---|---|---|
| Branche git | `main` | `staging` |
| URL | `contravo.excellenceteam.site` | preview Vercel de la branche |
| Base Neon | branche `production` (`ep-calm-salad-…`) | branche `staging` (`ep-ancient-resonance-…`) |
| Public | bêta-testeurs | l'équipe |

Les deux bases vivent dans le **même projet Neon**. La branche `staging` est une
copie instantanée de la production : même schéma, mêmes données au moment du
branchement, stockage facturé uniquement sur ce qui diffère ensuite.

## Où vit quoi

- **`.env` local** → base **staging**. L'URL de production n'y figure pas : la
  garder à portée de main, c'est finir par lancer une migration dessus.
- **Vercel, environnement Production** → base de production.
- **Vercel, environnement Preview** → base de staging.

## Travailler sur staging

```bash
git checkout staging
npm run dev          # tape sur la base staging
```

Vérification que l'isolation tient : créer un devis en local, puis confirmer
qu'il **n'apparaît pas** sur `contravo.excellenceteam.site`.

## Migrations

Une migration se joue **d'abord sur staging**, jamais l'inverse :

```bash
npm run db:apply     # applique les migrations à la base du .env courant
```

Une fois la fonctionnalité validée, la fusion de `staging` vers `main` déclenche
le déploiement de production — et c'est **à ce moment-là** que la migration doit
être rejouée sur la base de production.

> ⚠️ Les migrations depuis `0008` sont écrites à la main et idempotentes : les
> rejouer ne casse rien. Ça ne dispense pas de les appliquer dans le bon ordre.

## Rafraîchir staging depuis la production

La branche staging vieillit à mesure que la production reçoit des données
réelles. Pour repartir d'une copie fraîche : console Neon → branche `staging` →
**Reset from parent**. Les données locales de staging sont perdues, ce qui est
le but.

## Ce qui reste partagé

La branche Neon isole **la base**, rien d'autre. Restent communs aux deux
environnements :

- **Cloudflare R2** — même bucket, mêmes fichiers
- **GeniusPay** — mêmes identifiants marchands
- **n8n** — mêmes workflows, donc mêmes e-mails réellement expédiés

Conséquence pratique : un test qui envoie une facture depuis staging envoie un
**vrai e-mail**. Utiliser des adresses de test.
