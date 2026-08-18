# Contravo — script de la vidéo de présentation

Format 16:9, français, voix off masculine, ~2 min 30. Cible : agences, studios et
indépendants d'Afrique de l'Ouest qui facturent en francs CFA.

**Le parti pris.** La vidéo ne montre aucune animation abstraite et aucun mockup.
Tout ce qui apparaît à l'écran est l'application qui tourne, filmée sur le jeu de
données `Studio Baobab` ([lib/db/seed-demo.ts](../lib/db/seed-demo.ts)). L'argument
n'est pas « voilà une belle interface », c'est « la chaîne complète fonctionne, du
devis jusqu'à l'argent encaissé » — et elle se démontre en une seule prise.

**L'axe.** Ce qui distingue Contravo n'est pas la facturation, que tout le monde
fait. C'est la continuité : le même document traverse le devis, le contrat signé,
la facture, le paiement Mobile Money et la relance automatique, sans jamais être
ressaisi. Les scènes 8 à 14 sont le cœur de la vidéo ; le reste installe le
contexte.

---

## Scène 1 — Le constat

> Un devis envoyé par mail. Un contrat signé, scanné, puis perdu. Une facture
> relancée de mémoire, quand on y pense. À la fin du mois, personne ne sait
> vraiment ce qui a été encaissé.

**À l'écran** — visuel à fournir (voir [plan-tournage.md](plan-tournage.md)) :
bureau encombré, papiers, téléphone. Fondu lent, aucun texte incrusté.

**Intention** — nommer la douleur avant de nommer le produit. Personne n'achète
une solution à un problème qu'il n'a pas encore reconnu comme le sien.

---

## Scène 2 — La promesse

> Contravo relie tout ça. Une seule chaîne, du devis jusqu'à l'argent sur le
> compte.

**À l'écran** — la page d'accueil, scroll lent sur le hero. Titre animé
« Contravo » par-dessus.

---

## Scène 3 — Le tableau de bord

> Le tableau de bord montre ce qui est signé, ce qui reste à encaisser, et ce qui
> est déjà en retard. Aucune estimation : ce sont les factures elles-mêmes qui
> parlent.

**À l'écran** — `/dashboard`. Les chiffres visibles viennent des cinq factures du
jeu de démo, dont une à 28 jours de retard.

**Intention** — poser la crédibilité tout de suite. Un tableau de bord dont les
chiffres tombent juste vaut plus qu'un argumentaire.

---

## Scène 4 — Le client

> Un client, c'est une fiche unique. Ses projets, ses devis, ses factures, ce
> qu'il a payé et ce qu'il doit encore.

**À l'écran** — la liste des clients, puis la fiche *Pharmacie du Plateau* : deux
factures, un contrat signé, un projet en cours.

---

## Scène 5 — Le devis

> Le devis se construit ligne par ligne : quantité, prix unitaire, remise. La TVA
> s'applique au bon endroit, et les montants sont en francs CFA, sans centimes,
> parce que le franc n'en a pas.

**À l'écran** — `DEV-2026-0003`, ses trois lignes, le total à 850 000 F.

**Intention** — la phrase sur les centimes est un signal envoyé aux gens du
métier : l'outil a été écrit pour le franc CFA, pas traduit depuis l'euro. C'est
exactement le détail que les concurrents ratent.

---

## Scène 6 — L'envoi

> Un clic sur Envoyer. Le PDF se génère, le mail part avec la pièce jointe, et un
> lien privé est créé pour le client.

**À l'écran** — le clic sur « Envoyer », puis la confirmation. **Cette prise
modifie réellement l'état de la base** : elle génère le PDF et crée le jeton qui
sert à la scène 8.

---

## Scène 7 — Le document

> Le client reçoit un vrai document. Vos mentions légales, vos coordonnées
> bancaires, votre numéro de devis. Pas une capture d'écran envoyée à la hâte.

**À l'écran** — le PDF généré, ouvert en plein écran, scroll jusqu'au pied de page.

---

## Scène 8 — Le portail client

> Il ouvre son lien. Aucun compte à créer, aucun mot de passe. Il lit, et il
> accepte.

**À l'écran** — le portail public, puis le clic sur « Accepter » et le changement
de statut.

**Intention** — c'est l'objection numéro un des agences : « mon client ne va pas
créer un compte ». La réponse tient en trois secondes de vidéo.

---

## Scène 9 — La signature

> Le contrat suit le même chemin. Le client signe à l'écran, et Contravo scelle
> le document : empreinte du PDF, horodatage, adresse du signataire. La signature
> reste vérifiable des mois plus tard.

**À l'écran** — le tracé de la signature sur le canvas, puis le contrat passé à
« signé ».

---

## Scène 10 — La facture

> Vient la facture. Trois millions cent quatre-vingt-six mille francs à régler.
> Le client la voit, et il a un bouton pour la payer.

**À l'écran** — `FAC-2026-0003` côté portail, le montant dû, le bouton de paiement
en survol.

---

## Scènes 11 à 13 — Le paiement

C'est le sommet de la vidéo, et il tient en trois temps plutôt qu'un seul : le
choix du moyen de paiement, le geste sur le téléphone, l'encaissement constaté.
Un plan unique de vingt secondes aurait aplati le moment qui justifie le produit.

**Scène 11**

> Mobile Money, Wave, Orange Money, ou carte : le client choisit, et il est
> redirigé vers la passerelle de paiement.

**À l'écran** — le clic sur « Payer », puis la page GeniusPay.

**Scène 12**

> Il paie depuis son téléphone, en quelques secondes, sans quitter la
> conversation.

**À l'écran** — plan téléphone en main, tourné à part (le seul plan non
automatisé de la vidéo). Raccord de composition demandé avec la fin de la
scène 11.

**Scène 13**

> La passerelle confirme. Contravo enregistre le montant réellement reçu, les
> frais, et le net. Puis la facture passe à payée, toute seule.

**À l'écran** — la facture côté agence : statut « payée », la ligne
d'encaissement avec les frais et le net.

**Intention** — « le montant réellement reçu » n'est pas une formule de style :
la passerelle est re-interrogée avant tout encaissement, et un montant qui
diffère de l'intention de paiement ne solde pas la facture. C'est la différence
entre encaisser et croire qu'on a encaissé.

---

## Scène 14 — La relance

> Et quand personne ne paie ? Contravo relance sans qu'on le lui demande. Le jour
> de l'échéance, puis à sept jours, à quatorze, à trente. Le ton monte à chaque
> cran.

**À l'écran** — `FAC-2026-0002`, 28 jours de retard, avec les trois relances déjà
parties et la quatrième à venir.

**Intention** — le seul argument de la vidéo qui parle de trésorerie plutôt que
de confort. C'est celui qui fait payer un abonnement.

---

## Scène 15 — L'ouverture

> Chaque événement de cette chaîne est diffusable. Devis accepté, contrat signé,
> paiement reçu : votre système reçoit un webhook signé, avec les tentatives et
> les réponses tracées. Quarante-huit événements, et une API documentée.

**À l'écran** — l'écran développeur : un endpoint, la liste des livraisons.

**Intention** — s'adresser à l'acheteur technique et aux intégrateurs, en deux
phrases, sans ralentir le reste.

---

## Scène 16 — Clôture

Carte de fin, sans voix : **Contravo** / *Du devis à l'encaissement.*

---

## Ce que le script promet et que le produit doit tenir

Chaque affirmation ci-dessus est vérifiable dans le code. À revérifier avant le
tournage définitif, parce qu'une vidéo qui survend se retourne contre le produit :

| Scène | Affirmation | Où c'est tenu |
|---|---|---|
| 3 | Les chiffres viennent des factures | colonne générée `amount_due_cents` |
| 5 | Montants en francs entiers | [lib/money.ts](../lib/money.ts) |
| 6 | PDF joint + lien privé à l'envoi | `lib/repositories/quotes.repo.ts`, `lib/public-tokens/` |
| 8 | Portail sans compte | jeton public, `app/portal/` |
| 9 | Empreinte, horodatage, IP | table `signatures` |
| 13 | Montant réellement reçu | `processGeniusPayWebhook`, garde-fou de montant |
| 14 | Relances 0 / 7 / 14 / 30 | [lib/workflows/invoice-reminders.ts](../lib/workflows/invoice-reminders.ts) |
| 15 | 48 événements | [lib/webhooks/events.ts](../lib/webhooks/events.ts) — 48 dans 9 groupes, comptés le 17/08/2026 |
