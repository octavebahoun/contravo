# Plan de tournage

Ce que l'automate filme tout seul, ce qu'il faut fournir, et dans quel ordre —
parce que trois scènes dépendent de l'état de la base et ne peuvent pas être
tournées n'importe quand.

---

## 1. Avant de lancer quoi que ce soit

```bash
# Jeu de données propre (idempotent : ne touche que « studio-baobab »)
npx tsx lib/db/seed-demo.ts

# Serveur de dev, dans un terminal séparé
pnpm dev
```

**Aucun secret à fournir.** L'enregistreur se connecte comme **Fatou Diarra**
(`fatou.diarra@studiobaobab.ci`), l'administratrice créée par le seed, dont il
connaît donc le mot de passe. C'est aussi le bon choix à l'image : l'en-tête et le
menu utilisateur affichent ce compte, et une adresse Gmail personnelle à l'écran
ruinerait la cohérence de l'organisation de démonstration.

Le rôle `admin` couvre tout ce que la liste de plans touche — seules la
suppression d'organisation et la modification des rôles sont réservées au
propriétaire (`lib/rbac/roles.ts`). Pour filmer sous un autre compte :
`CAPTURE_EMAIL` et `CAPTURE_PASSWORD`.

La connexion passe par le vrai formulaire plutôt que par un cookie forgé : une
prise ne doit pas pouvoir réussir alors que l'authentification est cassée.

**Vérifications rapides avant la première prise**

| À vérifier | Pourquoi |
|---|---|
| Thème clair ou sombre, choisi une fois pour toutes | un changement de thème entre deux scènes se voit au montage |
| Aucune notification système à l'écran | le navigateur est piloté en arrière-plan, mais une modale d'onboarding gâche une prise |
| `FAC-2026-0003` encore en `sent` | les scènes 10 et 11 la montrent impayée |
| `CTR-2026-0003` encore en `draft` | la scène 9 la signe |
| `DEV-2026-0003` encore en `sent` | la scène 8 l'accepte |

Le seed remet ces trois documents dans le bon état. En cas de doute, le relancer.

---

## 2. Ordre de tournage

L'ordre des scènes à l'écran n'est pas l'ordre de tournage : trois prises
modifient la base et doivent passer avant celles qui montrent le résultat.

### Passe 1 — tout sauf la facture payée

```bash
npx tsx video/capture/record.ts 2 3 4 5 7 14 15
```

Ces sept scènes sont en lecture seule : elles peuvent être reprises autant de
fois que nécessaire.

### Passe 2 — la chaîne, dans l'ordre, une seule fois

```bash
npx tsx video/capture/record.ts 6     # envoie le devis → génère le PDF et le jeton
npx tsx video/capture/record.ts 8     # le client accepte
npx tsx video/capture/record.ts 9     # le client signe le contrat
npx tsx video/capture/record.ts 10    # la facture, impayée
npx tsx video/capture/record.ts 11    # départ vers la passerelle
```

Chacune consomme un état. Pour reprendre une prise ratée : relancer le seed et
repartir de la scène 6.

### Passe 3 — après le paiement réel en sandbox

Régler `FAC-2026-0003` pour de vrai depuis le lien de paiement GeniusPay sandbox
(c'est aussi ce qui fournit le plan téléphone de la scène 12), attendre que le
webhook soit traité, puis :

```bash
npx tsx video/capture/record.ts 13    # la facture passée à « payée »
```

Vérifier avant de filmer que la facture est bien soldée, sinon la scène contredit
la voix off :

```bash
npx tsx -e "require('dotenv').config();const p=require('postgres');const c=p(process.env.POSTGRES_URL);
c\`select number,status,amount_paid_cents,amount_due_cents from invoices where number='FAC-2026-0003'\`.then(r=>{console.table(r);return c.end()})"
```

---

## 3. Les trois plans non automatisés

### Scène 1 — le constat ✅ fourni

`video/media/scene_01_constat.png` — 1536×1024, généré à partir du `mediaPrompt`
du storyboard. Bureau ouest-africain en fin de journée, factures empilées, carnet
annoté, téléphone éteint, et « Payer l'abonnement · 160 000 » au tableau : le
détail en francs CFA fait le travail à lui seul.

L'image est en 3:2 et sera recadrée pour remplir le 16:9 — le cadrage supporte
la perte en haut et en bas. `zoom: "in"` lui donne son mouvement.

Si elle doit être animée plutôt que zoomée, le `motionPrompt` est prêt pour la
voie RunPod / Novita de la pipeline ; déposer alors le clip sous
`scene_01_constat.mp4` et passer `zoom` à `"none"`.

### Scène 12 — le téléphone

Plan serré sur une main qui valide le paiement, filmé pendant la passe 3 (le
paiement est réel, autant le filmer). À cadrer en 16:9, au moins aussi long que la
narration — environ 7 secondes. Raccorder la composition avec la fin de la
scène 11 : `matchCut: true` est déjà posé dans le storyboard.

Fichier attendu : `scene_12_telephone.mp4`.

### Scène 16 — la carte de fin

Rien à filmer : Remotion la rend à partir du champ `card` du storyboard.

---

## 4. Insert facultatif — la boîte mail

La scène 7 montre le PDF plutôt que l'e-mail, parce que le corps du message est
un gabarit MJML assemblé par n8n : il n'existe aucune page locale à filmer, et le
document joint est de toute façon la partie qui compte.

Si l'e-mail lui-même est jugé nécessaire, la scène 6 en envoie un vrai à
`DEMO_CLIENT_EMAIL`. Le filmer alors dans un profil de navigateur vierge, cadré
sur le message seul — jamais sur une boîte personnelle avec ses autres
conversations à côté.

---

## 5. Montage

```bash
# La pipeline lit tout depuis son propre public/ : les clips filmés (video/out/,
# régénérables, ignorés par git) et les médias fournis (video/media/, versionnés).
cp video/out/*.mp4 video/media/* /home/precieux/pipevideo/public/
cp video/storyboard.json /home/precieux/pipevideo/storyboard.json

cd /home/precieux/pipevideo
npm run tts        # voix off + durées + timings des sous-titres
npm run check-video
npm run render     # → out/video.mp4
```

`npm run tts` écrit `durationInSeconds` et `words` dans le storyboard : c'est lui
qui cale chaque scène sur sa voix off, il n'y a aucune durée à fixer à la main.

**Conséquence à surveiller** : un clip plus court que sa narration bouclera de
façon visible. Les durées prévues dans [shots.ts](capture/shots.ts) laissent une
marge, mais si le TTS rend une scène plus longue que prévu, rallonger le `wait`
final de la prise concernée et refilmer — plutôt que de raccourcir la narration.
