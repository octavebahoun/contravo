# Changelog

All notable changes to this project are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added — Promotion super-admin en ligne de commande
- `npm run db:super-admin <email>` (et `--revoke`). `users.is_super_admin` ouvre `/admin` et alimente l'en-tête `x-is-super-admin` ; **rien dans le produit ne peut le poser**, et c'est voulu — un propriétaire d'organisation ne doit pas pouvoir se promouvoir au niveau plateforme. En pratique cela voulait dire éditer la ligne à la main, et une remise à zéro (`npm run db:reset`) laissait le premier compte sans le drapeau : la section Administration n'apparaissait jamais.

### Changed — « Encaissement » disparaît de la barre latérale pour les non-administrateurs
- La page et sa route refusaient déjà les autres rôles, mais l'entrée restait visible de tous : seul `/dashboard/developer` était filtré. Les deux écrans partagent désormais la même liste. Ces identifiants permettent d'encaisser au nom de l'organisation — autant ne pas annoncer une porte qui ne s'ouvrira pas.

### Added — Le portail client peut enfin encaisser : connexion du compte GeniusPay
- Tout le circuit de paiement existait — `createPaymentIntent`, la redirection vers la page de règlement, le webhook signé qui **re-consulte la transaction chez GeniusPay avant de créditer quoi que ce soit** — mais **rien ne pouvait écrire une ligne dans `payment_gateway_credentials`** : seul le jeu de démonstration en créait. Toute organisation réelle avait donc `onlinePayment: false`, le portail retombait sur les coordonnées bancaires, et le bouton « Payer » n'apparaissait jamais. C'est cette moitié manquante.
- Écran `/dashboard/payments` (« Encaissement »), réservé aux propriétaires et administrateurs : les clés permettent d'encaisser au nom de l'organisation.
- Route `GET/PUT/DELETE /api/v1/organizations/[slug]/payment-gateway`. La clé secrète et le secret webhook sont chiffrés (AES-256-GCM, `PAYMENT_CREDENTIALS_KEK`) et **ne ressortent jamais** : la lecture ne renvoie qu'une clé publique masquée.
- Les identifiants sont **vérifiés auprès de GeniusPay avant d'être enregistrés** (`GET /account`, nouvelle méthode `GeniusPayClient.getAccount()`) : une faute de frappe est refusée ici plutôt que découverte par un client bloqué sur une page de paiement cassée. La réponse fournit aussi le nom du marchand et **l'environnement que la passerelle considère actif** — arbitre du sandbox contre le réel, plutôt que ce que le formulaire prétendait.
- Au plus une passerelle active par organisation : connecter le réel désactive le bac à sable. Le portail et `createPaymentIntent` choisissent « la ligne geniuspay active » sans nommer d'environnement — en laisser deux aurait fait dépendre le prochain paiement de l'ordre des lignes.
- Déconnexion = `status: 'disabled'`, jamais une suppression : la ligne est le seul enregistrement du compte marchand qui a encaissé les paiements déjà présents dans `payment_intents`.
- Vérifié de bout en bout contre le vrai compte : `GET /account` accepté, identifiants enregistrés pour « Excellence team », puis `createPaymentIntent` a rendu une vraie URL de règlement GeniusPay (`SANDBOX_…`). La sonde a été supprimée derrière elle.
- Deux écarts avec la documentation, relevés sur la réponse réelle : `id` est un uuid et non un entier, et le nom du marchand arrive dans `name`, pas `business_name`. Les deux formes sont acceptées.

### Changed — Les relances passent du planificateur au prestataire
- L'échelle J+0 / J+7 / J+14 / J+30 partait toute seule, et un prestataire ne pouvait **ni déclencher une relance ni en retenir une**. Relancer un client est une décision commerciale, pas un réglage technique.
- Nouveau bouton « Relancer le client » sur chaque facture dont l'échéance est dépassée, adossé à `POST /api/v1/invoices/[id]/reminders`. Il réutilise l'événement `invoice.overdue` et donc le même gabarit `email_invoice_overdue_v1`, avec la même escalade de ton par palier : un client relancé à la main ne reçoit pas un email d'une autre facture que celui du planificateur.
- Refusé avant l'échéance — ce gabarit affirme que la date est passée, l'envoyer plus tôt rendrait le message faux — et refusé deux fois dans les 24 h, pour la raison qu'une personne ne le ferait pas non plus.
- Carte « Relances » sur la facture : historique commun aux paliers automatiques et aux envois manuels, à consulter avant d'en ajouter un.
- Le balayage automatique devient **opt-in par organisation** (`organizations.auto_reminders_enabled`, faux par défaut), réarmable depuis « Encaissement ».
- Migration `0010` : colonnes `kind` (`auto` | `manual`) et `sent_by_user_id` sur `invoice_reminders`. L'index unique `(invoice_id, stage)` — ce qui rend le balayage idempotent — devient **partiel** (`where kind = 'auto'`) : appliqué à toutes les lignes, il aurait interdit une deuxième relance manuelle sur la même facture.
- Script `npm run db:apply <fichier.sql>` : depuis la 0008 les migrations sont écrites à la main et rendues idempotentes, mais leur application se faisait par copier-coller dans une console SQL, sans trace de ce qui avait tourné.

### Fixed — Le balayage de reprise des webhooks n'envoyait rien sous `neon-ws`
- `db.execute` ne rend pas la même forme selon le pilote : un tableau sous `postgres-js`, un objet portant `rows` sous `neon-ws`. Lu comme un tableau, le lot réclamé avait une longueur `undefined`, la boucle d'envoi ne tournait jamais — et **le balayage rapportait un succès sans avoir rien envoyé**, tout en ayant posé un bail de 10 minutes sur les lignes.
- Trouvé en vérifiant la relance manuelle de bout en bout, pas par relecture. Après correction, le même balayage a réclamé et livré les 5 livraisons en attente, toutes en 200 — dont l'email de relance.

### Fixed — Toute page rendue côté serveur retournait 500 dès que `DB_DRIVER=neon-ws`
- `ws` charge son accélérateur de masquage par un `require` optionnel. Empaqueté par Next, cet appel se résout sur un module vide et la première trame WebSocket meurt sur `TypeError: b.mask is not a function`, suivie de « Connection terminated unexpectedly ». **L'inscription, le tableau de bord et la mise en route retournaient 500** — sans rien afficher d'utile, Next masquant le détail en production.
- Le drapeau avait été ajouté pour les scripts, sur un réseau qui bloque le port 5432 ; personne n'avait vérifié ce qu'il faisait à l'application elle-même. `serverExternalPackages: ['ws', '@neondatabase/serverless']` les laisse chargés par `require` au démarrage, comme sous Node.
- Reproduit dans un navigateur réel — inscription, six étapes de mise en route, validation — avant et après, plutôt que déduit de la trace.

### Changed — La fin de la mise en route ne laisse plus l'écran figé onze secondes
- `completeOnboarding` redirigeait côté serveur. Appelée depuis `startTransition`, cette redirection oblige Next à rendre `/dashboard` dans la réponse de l'action : **11,1 s mesurées** entre le clic et l'arrivée, pendant lesquelles l'écran reste sur le récapitulatif, sans indication. Rien n'était cassé — mais rien ne distinguait cette attente d'un bouton mort.
- L'action retourne désormais sa destination et le client navigue lui-même : **4,0 s** dans les mêmes conditions. `router.replace`, pour que le bouton Retour du navigateur ne ramène pas sur un formulaire déjà validé.

### Added — Téléphone et directeur de la publication des mentions légales
- Deux des sept champs manquants sont renseignés. Les cinq autres — forme juridique, capital, RCCM, NCC, siège social — restent affichés `[À COMPLÉTER]` en attendant les documents d'immatriculation.

### Added — Mentions légales, confidentialité et conditions d'utilisation
- Trois pages publiques : `/mentions-legales`, `/confidentialite`, `/conditions`. Le pied de page pointait jusqu'ici sur `#cgu`, `#confidentialite` et `#contact` — trois ancres qui n'existaient nulle part : cliquer ne faisait rien.
- Le contenu décrit **l'architecture réelle**, pas une clause de style. La liste des sous-traitants est celle des services effectivement appelés — Vercel, Neon, Cloudflare R2, Resend, GeniusPay, n8n — avec ce que chacun voit passer. Les durées de conservation reprennent celles que le code applique déjà, jusqu'au jeton de portail dont seule l'empreinte est stockée.
- Le tableau des formules des CGU est **construit depuis `PLANS`** : les prix et les quotas affichés ne peuvent pas diverger de ceux que l'application facture.
- L'identité de l'éditeur vit dans `app/(landing)/_data/legal.ts`, partagée par les trois pages : une identité corrigée à un seul endroit ne peut pas se contredire d'une page à l'autre. Les champs manquants s'affichent en clair comme `[À COMPLÉTER]` — une mention légale incomplète doit se voir, pas se deviner.
- Les ancres du menu deviennent absolues (`/#faq` au lieu de `#faq`) : depuis une page légale, elles pointaient sur une section inexistante de la page courante.

### Fixed — `next build` échouait sur le fichier d'actions de la mise en route
- `app/onboarding/actions.ts` porte `'use server'`, où **tout export doit être une fonction asynchrone**. `composeLegalMentions` et `composeBankDetails`, deux fonctions pures exportées à côté des actions, faisaient échouer la compilation.
- Ni `tsc` ni les tests ne pouvaient le voir : la règle appartient au compilateur Next seul. Trouvé en construisant l'application avant de fusionner sur `main` — c'est-à-dire au dernier endroit où c'était encore trouvable avant un déploiement cassé.
- Le schéma, le type et les deux fonctions vivent désormais dans `app/onboarding/compose.ts`. `actions.ts` n'exporte plus que ses deux actions.

### Fixed — Les webhooks partaient quinze minutes après l'évènement, ou jamais
- `dispatchPending` lançait ses envois sans les attendre. Sur Vercel, la fonction peut être gelée à l'instant où la réponse part : l'appel HTTP n'avait alors jamais lieu, et la ligne restait `pending` avec **zéro tentative**. Constaté sur une demande de réinitialisation de mot de passe — l'évènement en base, aucune exécution côté n8n, aucune erreur nulle part.
- Le balayage de reprise finissait par la rattraper, mais seulement après `PENDING_STALE_MINUTES` : quinze minutes. Pour un lien de réinitialisation, c'est la différence entre un produit qui marche et un produit qui ne marche pas.
- Les envois passent désormais par `after()` : le runtime garde l'exécution vivante après la réponse. Hors contexte de requête — scripts, tests, le balayage lui-même — `after()` lève, et le comportement d'origine reprend la main : rien ne gèle ces processus-là.
- Le filet de sécurité reste en place. `after()` réduit le délai au cas normal ; le balayage couvre toujours le processus qui meurt pour de bon.

### Fixed — Supprimer son compte abandonnait l'organisation derrière lui
- `deleteAccount` ne supprimait que la ligne `users`. Les appartenances tombaient en cascade, mais l'organisation restait : ses clients, ses devis, ses factures et ses fichiers R2 survivaient sans qu'aucun compte ne puisse plus jamais les atteindre — ni les consulter, ni les effacer.
- Constaté sur la base fraîchement remise à zéro : une inscription à 23:17, une suppression de compte à 23:17:42, et une organisation fantôme créée une minute avant la vraie. Le journal d'audit en portait la trace exacte (`org.create`, `auth.signup`, `auth.delete_account`).
- Les organisations devenues sans membre sont désormais supprimées avec le dernier de leurs membres. Seulement celles-là : un propriétaire qui quitte une équipe ne doit pas emporter le travail des autres.
- `lib/db/bootstrap-n8n-key.ts` exige en outre une organisation **avec propriétaire**. Le tri par ancienneté seul avait retenu exactement l'organisation fantôme : la clé aurait été émise pour une organisation où personne ne peut se connecter.

### Fixed — « Failed to create user. Please try again. » sur une adresse déjà inscrite
- L'inscription renvoyait le même message pour deux causes opposées : l'adresse est déjà prise, ou l'insertion a échoué. Le conseil donné — réessayer — était impossible à suivre dans le premier cas : l'adresse restera prise au deuxième essai comme au premier. Les deux cas sont désormais distingués, et le premier renvoie vers la connexion.
- La connexion, elle, garde son message unique et volontairement vague pour les deux échecs possibles : c'est là que l'énumération de comptes serait exploitable, pas à l'inscription.
- Les douze messages d'authentification étaient en anglais dans une application entièrement française. Traduits.

### Added — Remise à zéro d'avant production
- `lib/db/purge.ts --all-users` supprime **tous** les comptes, jeu de démonstration compris : avant une mise en production, le premier compte créé doit être l'administrateur définitif et traverser l'inscription puis la mise en route comme le fera n'importe quel client. Sans ce drapeau, la purge épargne les comptes réels — le bon comportement en développement, le mauvais ici.
- `lib/db/bootstrap-n8n-key.ts` réémet la clé dont n8n se sert pour rappeler `/api/v1/webhooks/verify`. Elle ne peut pas être recréée par la purge : `api_keys.organization_id` est NOT NULL et il n'existe plus d'organisation à ce moment-là. L'ordre — purge, inscription, clé — n'est donc pas un usage mais une contrainte du schéma, et la purge l'affiche désormais en fin de course.
- L'ancienne clé est **révoquée**, jamais supprimée : la ligne garde sa trace d'audit et une clé compromise ne peut pas réapparaître.
- `doc/MISE-EN-PRODUCTION.md` déroule les six étapes et, pour chacune, le signe qu'elle a réussi. Les deux qui cassent sans bruit y sont nommées : la clé n8n absente (le routeur répond 200 puis meurt en 401, Contravo note « livré avec succès ») et Resend resté en bac à sable (`onboarding@resend.dev` ne livre qu'au titulaire du compte).

### Fixed — Un environnement GeniusPay déclaré `live` pouvait encaisser en simulation
- `GeniusPayClient` utilise la **même URL** en bac à sable et en réel : seules les clés distinguent les deux. `EXCELLENCE_GENIUSPAY_ENV` était donc stocké et jamais lu — déclarer `live` en gardant des clés sandbox laissait tourner de vrais paiements en simulation, sans le moindre signe.
- Le constructeur refuse désormais de démarrer quand le préfixe des clés contredit l'environnement déclaré. Un basculement à moitié fait échoue immédiatement, avec la raison, au lieu de produire des encaissements fantômes.

### Fixed — Le routeur n8n recevait les évènements mais ne pouvait plus envoyer un seul email
- `lib/db/purge.ts` a détruit la clé API dont n8n se sert pour rappeler Contravo. Depuis, chaque évènement suivait le même trajet : livraison acceptée (HTTP 200, la base la note `success`), puis `POST /api/v1/webhooks/verify` refusé en **401 UNAUTHENTICATED** et exécution n8n en erreur. Aucun email depuis le 18/08 15:07 — et rien côté Contravo pour le signaler, puisque de son point de vue la livraison avait réussi.
- Le routeur ne peut pas vérifier la signature lui-même : le bac à sable des nœuds Code n8n interdit `crypto` et `process.env`. Il renvoie donc le corps à Contravo, ce qui fait de cette route un maillon obligatoire du chemin des emails — et de sa clé un point de panne unique, invisible depuis le tableau de bord.
- La purge protège désormais ce câblage : l'endpoint `n8n_primary` global est **sauvegardé et réinséré** après le `TRUNCATE`, secret compris, et toute clé portant `webhooks:manage` est annoncée avant destruction avec la marche à suivre. Le secret d'une clé ne se relit pas — la seule protection possible est de prévenir.
- Nouvelle clé émise pour n8n, portée par l'organisation réelle et non par celle de démonstration : `seed-demo.ts` démonte `studio-baobab` à chaque passage et l'emporterait avec.

### Changed — Un seul compte GeniusPay pour les abonnements et les factures
- GeniusPay ne propose pas encore plusieurs comptes marchands par utilisateur. Le compte « Excellence » distinct que prévoyait `doc/MVP6.md` §2 n'est pas ouvrable : les abonnements passent par le compte des transactions clientes, et les variables `EXCELLENCE_GENIUSPAY_*` pointent délibérément sur les mêmes clés.
- Les deux flux restent séparés là où ça compte : `metadata.kind = 'saas_subscription'` à l'aller, un handler qui écarte tout le reste au retour, et deux jeux de tables distincts (`subscription_cycles` d'un côté, `invoice_payments` de l'autre). Chaque encaissement reste horodaté et rattachable.
- Ce qui est réellement partagé, c'est le **plafond** : 500 000 XOF par mois pour les deux flux réunis, commission 1,5 %. À 15 000 XOF l'abonnement Pro, une trentaine d'abonnements le saturent avant même de compter les factures des agences.
- `doc/COMPTE-EXCELLENCE.md` porte la décision, ce qui la rend sûre, et les quatre variables à échanger le jour où le multi-compte existera — aucune ligne de code à toucher ce jour-là.

### Changed — Le paiement d'abonnement échoue franchement au lieu de faire semblant
- `createSubscriptionCheckout` vérifie le compte marchand **avant la moindre écriture**. Le repli qui fabriquait une fausse URL de paiement est supprimé : il renvoyait l'utilisateur sur la page dont il venait, et laissait derrière chaque clic un `subscription_cycle` en `pending` et une tentative de paiement qui n'attendaient rien.
- Une réponse de passerelle sans URL est traitée comme un échec, quoi qu'en dise son champ `success` : il n'y a nulle part où envoyer le client. Le cycle et la tentative passent alors en `failed` avec le motif renvoyé par GeniusPay, au lieu de rester en attente indéfiniment.
- Le message d'erreur distingue les deux cas : « pas encore configuré » (503, aucune clé) et « échec de l'initialisation » (502, la passerelle refuse, avec sa raison).
- `doc/COMPTE-EXCELLENCE.md` : la marche à suivre pour ouvrir le compte marchand qui encaissera réellement les abonnements — les trois valeurs à recopier, l'URL de webhook à déclarer, et le plafond de 500 000 XOF/mois du compte actuel, soit une trentaine d'abonnements Pro.

### Fixed — « Passer à Pro » changeait l'URL sans rien faire
- `createSubscriptionCheckout` lit `EXCELLENCE_GENIUSPAY_API_KEY_PUBLIC` et `EXCELLENCE_GENIUSPAY_API_SECRET`. **Ces variables n'ont jamais été renseignées** : `.env.example` ne portait que des `***`, et il n'existe qu'un seul compte GeniusPay, celui des factures des organisations. Le compte marchand « Excellence » de `doc/MVP6.md` §2 n'a pas d'existence côté passerelle.
- Sans elles, le service retombait sur une URL de repli pointant sur `/dashboard/billing` lui-même : le navigateur y allait, aucun code ne lisait `simulated_checkout=1`, la page se rechargeait à l'identique. Un repli qui imite un paiement sans en être un vaut moins qu'une erreur franche — et chaque clic laissait tout de même un `subscription_cycle` en `pending` et un `subscription_payment_attempts`, insérés avant l'appel à la passerelle.
- Les clés sandbox existantes servent de compte Excellence **en test uniquement**, ce que `doc/MVP6.md` interdit en production : en `live`, ces clés encaissent l'argent d'Excellence, celles des organisations le leur. À séparer avant la bascule.
- `GeniusPayClient` envoie désormais `Accept: application/json`. Sans cet en-tête, la passerelle répond à une erreur de validation par une page HTML en 200 : le motif du refus — « Le montant minimum pour XOF est 200 » — se perdait derrière un `Unexpected token '<'` illisible. Trouvé en sondant l'API avec un montant volontairement trop bas.
- Vérifié de bout en bout sur le sandbox : `POST /payments` répond `checkout_url = https://geniuspay.ci/checkout/SANDBOX_…`, page joignable en 200.

### Added — Mise en route au premier accès (`/onboarding`)
- L'inscription ne peut inventer qu'un nom d'organisation (`"<untel>'s Organization"`) et laisse vides les mentions légales et les coordonnées bancaires. La première facture partait donc sans les mentions qui en font un document opposable, et sans le RIB par lequel le client est censé payer. Six étapes, posées une fois, en tirent un compte réellement utilisable.
- `organizations.onboarding_completed_at` (migration `0009_onboarding.sql`) porte l'état. Le middleware redirige vers `/onboarding` tant qu'il est nul, sur la même passe qui vérifie déjà la suspension : l'organisation courante n'est résolue qu'une fois, la garde ne coûte aucune requête supplémentaire.
- La migration **estampille les organisations existantes** : sans cela, tout compte déjà en service se serait retrouvé enfermé dans un formulaire de première mise en route.
- Le passage est **sautable**, et sauter estampille quand même. Redemander à chaque connexion transformerait la mise en route en péage ; les champs restent accessibles dans les Paramètres.
- Seul un propriétaire écrit les réglages de l'organisation ; un membre invité ne reçoit que l'estampille. Le formulaire n'a pas à devenir un contournement du contrôle d'accès.
- `composeLegalMentions` et `composeBankDetails` sont exportées et testées à part (`tests/onboarding-composition.test.ts`) : ce sont elles qui décident du texte imprimé sur chaque PDF, et un champ vide ne doit jamais produire une ligne orpheline du type « IBAN : ».

### Added — Purge de la base et jeu de données de démonstration
- `lib/db/purge.ts` vide le schéma `public` et les objets R2 correspondants. La base portait 459 lignes de résidus de développement : 17 organisations dont la moitié nommées `"<untel>'s Organization"`, 118 lignes d'audit, 105 livraisons de webhook, des factures issues de tests ratés. Inutilisable pour une démonstration, et surtout : des fixtures qui masquent les vrais problèmes.
- Deux choses survivent volontairement. **`users`** : un hash de mot de passe ne se régénère pas, vider la table condamnerait les comptes réels — seuls les comptes correspondant aux motifs de test sont supprimés. **Le journal de migration**, qui vit dans le schéma `drizzle` et non dans `public`, donc `drizzle-kit migrate` considère toujours le schéma à jour.
- Simulation par défaut : le script affiche ce qu'il détruirait et ne détruit rien sans `--yes`.
- Un seul `TRUNCATE ... CASCADE` plutôt qu'une suppression table par table : les clés étrangères `RESTRICT` (`invoice_payments.invoice_id`, `signatures.signed_pdf_file_id`) exigeraient un ordre exact. Les objets R2 sont supprimés **avant**, sinon chaque PDF généré resterait orphelin dans le bucket pour toujours.
- `lib/db/seed-demo.ts` : une agence — Studio Baobab, Abidjan — 4 clients, 4 projets, 4 devis, 3 contrats, 5 factures, 2 encaissements, 3 relances, 5 dépenses, 3 livrables et un avis. Les quatre dossiers sont à quatre étapes différentes du cycle de vie, de sorte qu'un seul passage dans l'application montre la chaîne entière.
- **Toutes les dates sont relatives au jour d'exécution.** Des dates figées rendraient la facture en retard vieille de deux mois au moment du tournage, et l'échelle de relance sauterait directement à son dernier cran.
- Les montants sont en francs entiers et réconcilient : somme des lignes = HT, HT + TVA = total, `amount_due_cents` (colonne générée) = total − encaissé. Vérifié en base après le semis.
- `quota_usage` n'est délibérément pas écrit : des triggers `AFTER INSERT/UPDATE/DELETE` sur `clients`, `projects`, `memberships`, `api_keys` et `webhook_endpoints` tiennent déjà cette ligne à jour — et l'avaient calculée juste. L'écrire à la main ne pouvait que les contredire.
- `document_sequences` est positionné aux derniers numéros émis : sans cela, le premier document créé pendant une démonstration s'appellerait `DEV-2026-0001` et entrerait en collision avec une ligne existante.
- Les identifiants GeniusPay sandbox sont re-chiffrés depuis `.env` vers l'organisation de démonstration, pour que le paiement Mobile Money soit réellement exécutable. Aucun secret n'est porté par le script.
- Le semis est rejouable : l'organisation `studio-baobab` est démontée d'abord, et rien d'autre n'est touché.

### Fixed — Deux écrans du tableau de bord renvoyaient 500 sur la fiche client
- `GET /api/v1/clients/:id/invoices` et `GET /api/v1/clients/:id/projects` échouaient sur `Do not know how to serialize a BigInt`. **La fiche client n'a donc jamais affiché ni ses projets ni ses factures**, depuis qu'elle existe.
- La sérialisation des montants existait, mais **en ligne** dans les routes de liste (`/api/v1/invoices`, `/api/v1/projects`) : elle n'a simplement jamais été recopiée dans les deux routes rattachées à un client. Une logique dupliquée finit toujours par manquer quelque part.
- `serializeInvoice` et `serializeProject` vivent désormais dans leurs dépôts, et `bigintToString` dans `lib/money.ts` — la convention « les unités mineures traversent le réseau en chaînes » appartient au même endroit que le reste de la convention monétaire. Les quatre routes s'en servent.
- `budgetCents` reste `null` plutôt que `"0"` : un projet sans budget est un état réel, que l'interface doit pouvoir distinguer de zéro.
- Trouvé en filmant la vidéo de présentation : la scène 4 aurait enregistré un écran vide sous une voix off énumérant « ses projets, ses devis, ses factures ».

### Added — Outillage de la vidéo de présentation (`video/`)
- Script, storyboard, plan de tournage et un enregistreur qui **filme l'application réelle** : Chrome piloté par Puppeteer sur le jeu de démonstration, encodé en 1920×1080 à 30 images/s. Aucun mockup, aucune animation de substitution — pour un SaaS B2B, la seule chose qui convainc est que la chaîne fonctionne, et une reconstitution ne le prouve pas.
- Les plans référencent des **numéros de document** (`DEV-2026-0003`), jamais des UUID, résolus en base au moment du tournage : le jeu de démonstration est re-semé régulièrement et ses identifiants changent à chaque fois.
- Trois détails qui séparent une capture utilisable d'une capture inutilisable :
  - **Curseur de synthèse.** `Page.screencast` capture la page, pas le pointeur : sans lui, les clics donnent l'impression que l'interface réagit à rien. Il est injecté au chargement du document, pas à sa création — `document.body` n'existe pas encore à ce moment-là, et l'ajout échouait silencieusement.
  - **Mouvements interpolés.** Un `scrollBy` atterrit en une image, ce qui se lit comme une coupe et non comme un mouvement. Scrolls et déplacements de souris sont lissés dans le temps.
  - **Badge dev de Next masqué.** Il se trouve dans un portail en coin de chaque page de développement, et n'a rien à faire dans une vidéo produit.
- Le scroll est passé en chaîne à `page.evaluate` et non en fonction : tsx compile avec `keepNames` d'esbuild, qui enveloppe chaque fonction nommée dans un appel `__name()` absent du navigateur — d'où un `__name is not defined` à la première prise.
- Chrome est lancé sans bac à sable : cet Ubuntu interdit les espaces de noms utilisateur non privilégiés via AppArmor, et le zygote refuse de démarrer. Acceptable **ici seulement** — l'outil ne charge que notre propre localhost.
- Le jeton de portail est frappé par `generatePublicToken`, la fonction même qu'emprunte l'envoi : seul son hash est stocké, rejouer un lien reçu par mail est impossible, et la page filmée reste identique à celle qu'ouvre un vrai client.
- La capture se connecte sous **Fatou Diarra**, l'administratrice créée par le seed, et non sous le compte propriétaire réel. D'abord parce que l'en-tête et le menu utilisateur affichent ce compte, et qu'une adresse Gmail personnelle à l'écran ruinerait la cohérence de l'organisation de démonstration ; ensuite parce que le seed fixe ce mot de passe, donc filmer ne réclame aucun secret. `admin` couvre tout ce que la liste de plans touche.
- Le tournage réel a corrigé quatre défauts que seule une prise pouvait révéler :
  - **Le serveur de dev compile la route à la première visite.** La scène des relances est revenue en dix secondes de spinner. Chaque plan visite donc son URL deux fois : la première paie la compilation hors caméra. Une vue qui tourne encore au bout de 20 s fait désormais échouer la prise plutôt que d'enregistrer le spinner.
  - **Une étape en échec tuait tout le processus.** Le screencast restait actif, et fermer le contexte par-dessus levait `Page.screencastFrameAck: Target closed` depuis la boucle d'évènements — un rejet non capturé qui emportait toutes les scènes encore en file. Le recorder est maintenant arrêté dans le `finally`.
  - **Une page qui ne repeint pas ne produit aucune image.** L'écran développeur tient exactement dans la fenêtre : rien à faire défiler, donc rien à repeindre, donc un fichier de zéro octet. Un pixel invisible change de couleur à chaque frame pour garder le flux vivant.
  - **Les jetons de portail étaient refusés.** Les actions étaient inventées (`view`) au lieu d'être reprises de `payload-builder` (`read`) : le portail répondait « Accès refusé » à chaque plan client.
- Les libellés des boutons ont été **lus sur les pages**, pas devinés : « Envoyer au client », « Accepter le devis », « Signer le contrat », « Payer … en ligne ». Les quatre premières prises de la chaîne avaient échoué sur des sélecteurs plausibles mais faux.
- Le jeu de démo a suivi : le devis repasse en `draft` (le bouton « Envoyer » n'existe que sur un brouillon) et le contrat en `sent` (le portail n'affiche le pavé de signature qu'une fois le contrat envoyé).
- L'organisation n'est plus résolue au démarrage mais à la première utilisation : les plans sans référence à un document — la landing — se filment désormais même quand la base est injoignable, c'est-à-dire précisément quand on a besoin d'avancer sur autre chose.

### Fixed — Le catalogue de webhooks compte 48 événements, pas 46
- L'entrée précédente de ce changelog et le script de la vidéo annonçaient 46. `WEBHOOK_EVENT_NAMES` en contient 48, répartis en 9 groupes, sans doublon ni caractère générique dans le compte. Corrigé là où le chiffre est énoncé.

### Changed — Next épinglé en 15.5.23, sortie des canary
- Le projet tournait sur `15.6.0-canary.59` : une canary d'une version **jamais sortie en stable**, la ligne étant passée de 15.5.x à 16.x. C'est le suspect principal du crash `removeChild` de `/dashboard/contracts`, dont le balisage avait été audité et jugé valide. 15.5.23 est le tag `backport`, c'est-à-dire la ligne 15.5 encore maintenue.
- `experimental.ppr` et `experimental.clientSegmentCache` ont été retirés : réservés aux canary, `next build` refuse de démarrer avec eux sur une version stable. Ce sont des optimisations de rendu — les routes qui étaient en pré-rendu partiel sont désormais simplement rendues à la demande, sans perte fonctionnelle.
- `next build` réécrit lui-même `tsconfig.json` (`"jsx": "react-jsx"` → `"preserve"`, Next compilant le JSX via SWC). Vitest héritait de ce réglage et a cessé de transformer le JSX : **tous les tests `.tsx`, et tous les `.ts` important le service PDF, ne se parsaient plus**. La configuration JSX est maintenant portée par `vitest.config.mjs`, via `oxc` puisque Vite 8 transforme avec oxc/rolldown et non plus esbuild.
- Les 16 écrans du tableau de bord et les 100 tests passent sur la version épinglée. Le crash `removeChild` lui-même se constate au clic : à confirmer côté navigateur.

### Fixed — Un événement était émis avant que l'écriture qui le justifie soit commitée
- `emit()` était appelé depuis l'intérieur de `db.transaction()` mais écrivait par la connexion **globale**. Trois défauts distincts en découlaient :
  1. la ligne d'outbox atterrissait hors de la transaction — une écriture métier annulée ensuite laissait quand même un webhook en file, **et déjà envoyé**, pour une entité qui n'a jamais existé ;
  2. `dispatchDelivery` partait avant le commit, donc un consommateur pouvait rappeler et lire l'entité avant qu'elle soit visible. n8n récupérant un devis qu'on venait de lui annoncer, et recevant un 404, c'est cette course ;
  3. toute erreur pendant la construction ou l'insertion de l'événement annulait la transaction métier — un `bigint` dans un payload avait déjà fait annuler la facture qui l'avait produit.
- `withOutbox(fn)` remplace `db.transaction(fn)` sur les 9 transactions concernées : les événements sont insérés **avec** la transaction et dépêchés **après** son commit.
- `tests/webhook-outbox.test.ts` fige l'invariant, dont le cas que l'ancien code ne pouvait pas passer : un événement émis puis suivi d'un échec ne laisse aucune ligne derrière lui.

### Fixed — Un devis ou une facture créé directement en « envoyé » n'envoyait jamais son email
- `buildEventPayload(withPdfUrl)` était appelé dans la transaction de création. Il rend le PDF, et `loadQuotePdfData` lit par la connexion globale : la ligne en cours de création lui était **invisible**, il jetait `NOT_FOUND`, et le `catch` avalait l'événement `quote.sent` / `invoice.sent` en entier. Or c'est exactement ce que fait le formulaire du tableau de bord, qui crée avec `status: 'sent'`.
- L'émission a lieu après le commit. Vérifié : `quote.sent` part désormais avec son `pdfUrl` et son lien portail.
- Un devis créé directement en `sent` ne renseignait pas `sentAt` et affichait « Envoyé le — » pour toujours.

### Added — Relances de facture J+7 / J+14 / J+30
- MVP5 §3.2 prévoit ces relances, et toutes les pièces existaient — la transition `mark_overdue`, l'événement `invoice.overdue`, le workflow `email_invoice_overdue_v1` — mais **rien ne les déclenchait**. Le seul chemin était un humain cliquant un bouton : une facture impayée était silencieusement oubliée.
- `POST /api/internal/cron/invoice-reminders`, authentifié par `CRON_SECRET` en comparaison à temps constant, et le workflow n8n `cron_invoice_reminders_v1` qui l'appelle chaque jour à 8 h.
- Table `invoice_reminders` (migration `0008`) : l'index unique `(invoice_id, stage)` **est** le mécanisme d'idempotence. La passe tourne tous les jours ; sans lui, chaque facture en retard serait relancée quotidiennement. La relance est réclamée avant tout envoi, et la ligne est relâchée si l'envoi échoue — sinon une panne passagère produirait une relance jamais envoyée dont la ligne affirme le contraire.
- Le palier retenu est le plus élevé atteint, pas le suivant : une facture découverte tardivement (première exécution, ou reprise après panne) reçoit la relance qu'elle mérite au lieu de rejouer toute l'échelle.
- Une facture soldée ou annulée n'est jamais relancée : la sélection s'appuie sur `amount_due_cents`, colonne générée.
- Le même événement partant quatre fois, le template escalade désormais son ton (rappel → relance → deuxième → dernière) via `reminderStage`. Il recevait auparavant quatre fois exactement le même message.
- `payload.totalLabel` et `payload.amountDueLabel` sont préformatés par l'application : les templates tournent dans des nœuds Code n8n qui ne peuvent pas importer `lib/money.ts`, et la convention XOF avait déjà divergé sur quatre surfaces.

### Added — Gestion des endpoints webhook
- La carte « Endpoint Webhook n8n / Make » de l'écran Développeur **ne faisait rien** : URL de démonstration dans un champ non contrôlé, deux événements codés en dur sur les quarante-huit réellement émis, et un bouton « Enregistrer l'Endpoint » **sans `onClick`**. `createWebhookEndpoint()` existait dans la librairie sans aucun appelant, et aucune route ne permettait d'enregistrer une destination : le seul endpoint existant était le `n8n_primary` global, inséré à la main.
- Écran fonctionnel : création, liste, activation/désactivation, suppression, rotation du secret, envoi d'un événement de test, et historique des livraisons avec renvoi manuel.
- `lib/webhooks/events.ts` : catalogue des 48 événements, groupés et libellés. Rien ne validait le tableau `events` — un endpoint enregistré avec une faute de frappe était accepté puis **ne se déclenchait jamais**.
- Le secret de signature n'est affiché qu'à la création et après rotation, comme une clé API : il n'est jamais relisté. Un secret perdu se remplace, il ne se récupère pas.
- URL refusée si elle n'est pas en HTTPS, ou si l'hôte n'est joignable que depuis notre réseau (`localhost`, `127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `169.254.*`, `.internal`, `.local`) : le dispatcher tourne côté serveur, une telle URL en ferait un forgeur de requêtes contre notre propre infrastructure.
- Le quota `maxWebhookEndpoints` du plan est enfin appliqué sur ce chemin (1 en Free, 10 en Pro, 50 en Business).
- `redeliverWebhook()` était écrit et injoignable, faute de route : une livraison abandonnée après ses six tentatives automatiques ne pouvait plus être rejouée.
- L'endpoint global de la plateforme reste invisible et intouchable depuis une organisation (vérifié : `404` sur suppression comme sur rotation).

### Fixed — Tous les montants en XOF étaient divisés par 100
- Le XOF n'a pas de subdivision (exposant ISO 4217 à 0) : une colonne `*_cents` d'un document métier contient des francs entiers, et `25000` vaut 25 000 XOF. Quatre surfaces divisaient malgré tout par 100, dont **les trois que le client voit** :
  - **le PDF joint à chaque email** imprimait « 250,00 XOF » sur une facture de 25 000 XOF ;
  - **le portail client** affichait le même centième, donc un chiffre différent de celui que le tableau de bord montrait à l'émetteur ;
  - **le montant envoyé à GeniusPay** : une facture de 25 000 XOF aurait été encaissée 250 XOF (l'API attend des unités entières, `{"amount": 5000}` pour 5 000 XOF) ;
  - l'admin SaaS libellait en euros un MRR en XOF et le divisait par 100 (« 150,00 € » pour 15 000 XOF).
- `lib/money.ts` centralise la convention et connaît les devises sans subdivision. Le PDF, le portail et les vues détail y délèguent, donc les trois ne peuvent plus diverger. `tests/money-convention.test.ts` fige le contrat.
- `PLANS.priceMonthlyCents` et `subscription_cycles.amount_cents` restent, eux, en **centièmes de XOF** (15 000 XOF = `1_500_000`). Cette divergence est documentée plutôt que migrée : ce côté-là divise déjà par 100 avant d'encaisser et des cycles historiques existent. `formatSaasPrice` sert à les afficher.
- Le MRR admin lisait des prix codés en dur au lieu de `PLANS` ; il suivait donc silencieusement l'ancien tarif après un changement. La tuile « organisations actives » comptait aussi les organisations supprimées.

### Fixed — Le webhook GeniusPay créditait le montant demandé, pas le montant reçu
- `recordPayment` recevait `intent.amountCents` : un paiement d'un montant différent de l'intention était enregistré **comme s'il l'avait soldée intégralement**. Le contrôle existant ne comparait que le corps du webhook à la transaction re-interrogée — deux valeurs venant de la passerelle — et ne détectait donc pas cet écart. Le montant crédité vient désormais de la transaction confirmée, et un écart avec l'intention bloque l'imputation en journalisant `amount_differs_from_intent`.
- Les frais et le net de passerelle étaient multipliés par 100 en dur, ce qui les centuplait en XOF.

### Fixed — La régénération d'un PDF répondait 500
- La clé R2 d'un document est stable (`org/<id>/invoices/<id>/invoice-<numéro>.pdf`), mais `uploadServerFile` insérait toujours une nouvelle ligne : la contrainte `files_r2_key_unique` sautait. **`POST /api/v1/{invoices,quotes,contracts}/:id/pdf/regenerate` échouait donc dès qu'une première version existait**, et aucun document ne pouvait être corrigé. La ligne existante est maintenant mise à jour en place — même document, même `pdf_file_id` — et le quota de stockage bouge du delta de taille au lieu de compter un fichier de plus.

### Fixed — En local, les pages du portail interrogeaient l'API de production
- Les cinq pages `app/portal/*` construisaient l'URL de leur propre API avec `NEXT_PUBLIC_APP_URL`, qui contient l'adresse publique destinée aux liens envoyés aux clients. Un serveur local affichait donc les données de production, et tout champ ajouté localement à l'API était absent de la réponse. `getSelfOrigin()` utilise l'origine de la requête en cours ; `getAppUrl()` reste la bonne réponse pour ce qui sort du processus (emails, PDF, liens portail).

### Added — Paiement en ligne depuis le portail client
- `POST /api/v1/portal/invoices/:id/pay` et le bouton « Payer en ligne ». `createPaymentIntent()` existait mais **aucune route ne l'appelait** : le client ne pouvait que lire les coordonnées bancaires. La moitié webhook était complète depuis le début (signature HMAC, fenêtre de 5 min, idempotence sur `(provider, event_id)`, et re-interrogation de la transaction auprès de GeniusPay avant toute imputation).
- L'intention ne porte plus `totalCents` mais le **solde restant dû**, et le paiement est refusé sur une facture `draft`, `paid`, `cancelled` ou `refunded`.
- Le bouton n'apparaît que si l'organisation a une passerelle active (`onlinePayment` dans la réponse du portail) : pas de bouton mort. Un refus de la passerelle renvoie un `502` explicite au lieu du « An unexpected error occurred » d'un `Error` nu, et les coordonnées bancaires restent proposées en repli.
- Le jeton public n'est volontairement pas consommé à l'ouverture du checkout : un client qui abandonne doit pouvoir revenir.

### Added — Vues détail (client, projet, devis, facture)
- Quatre pages `[id]` et des lignes de tableau cliquables. Les quatre modules étaient **en liste seule** : cliquer une ligne ne faisait rien, et tout ce que l'API exposait par entité (lignes de devis, paiements, rentabilité, livrables, dépenses) était inatteignable depuis l'interface.
- `/dashboard/clients/[id]` : fiche complète, édition en place, archivage/réactivation, total facturé, reste à encaisser, projets et factures du client.
- `/dashboard/projects/[id]` : machine à états (activer, mettre en pause, reprendre, livrer, annuler, archiver — seules les transitions que le serveur accepte sont proposées), rentabilité, livrables, dépenses, devis et factures rattachés. C'est aussi le seul endroit qui appelle **`POST /api/v1/projects/:id/review-request`** : la route existait, aucun bouton ne la déclenchait.
- `/dashboard/quotes/[id]` et `/dashboard/invoices/[id]` : lignes, totaux, dates de cycle de vie, PDF, et les transitions que l'équipe possède. Accepter ou refuser reste du ressort du client, via le portail.
- `app/(dashboard)/dashboard/_components/detail-ui.tsx` : formatage monétaire et de dates partagé. Les montants ne sont pas divisés (XOF n'a pas de subdivision) et la locale est figée à `fr-FR`, sinon le serveur et le navigateur en choisissent une différente et React signale une erreur d'hydratation.

### Added — Encaissement manuel d'une facture
- `POST /api/v1/invoices/:id/payments` et le formulaire correspondant sur la vue détail. `recordPayment()` existait dans le dépôt mais n'était atteignable que par le webhook GeniusPay : **un virement, un Mobile Money ou des espèces ne pouvaient être enregistrés nulle part**, donc aucune facture ne pouvait passer à `paid` sans passer par la passerelle.
- Refuse un montant nul ou négatif, et refuse tout encaissement sur une facture `draft`, `paid`, `cancelled` ou `refunded` — sinon le recalcul la rouvrait silencieusement en `partial`.
- Validé en réel : 8 000 XOF → statut `partial`, puis 12 000 XOF → `paid` avec `paidAt` renseigné, événement `invoice.paid` livré à n8n en HTTP 200. Les deux gardes renvoient bien `400`. Données de test supprimées.

### Fixed — Le N° de devis et de facture ne s'affichait jamais
- Les écrans Devis, Factures et le tableau de bord lisaient `quoteNumber` / `invoiceNumber`. La colonne s'appelle `number` et l'API la sérialise telle quelle : **la colonne « N° » était vide sur les trois écrans**, et la recherche par numéro ne pouvait rien trouver.

### Fixed — Les dépenses d'un projet renvoyaient 500
- `GET /api/v1/projects/:id/expenses` retournait les lignes brutes ; `amountCents` est un `bigint`, que `NextResponse.json` ne sait pas sérialiser. La route échouait dès qu'un projet avait au moins une dépense. `serializeExpense` est désormais appliqué, comme sur `/api/v1/expenses`.

### Fixed — L'envoi de facture répondait 500
- `invoice.state.ts` affectait `updateFields.issueDate = new Date()`. `issue_date` est une colonne `date`, que drizzle mappe en mode chaîne : l'objet `Date` atteignait postgres.js non sérialisé et faisait jeter `Buffer.byteLength`. **`POST /api/v1/invoices/:id/transition {action:'send'}` échouait systématiquement en 500**, donc aucune facture ne pouvait être envoyée, y compris par le bouton « Envoyer » de l'écran Factures. Les 8 colonnes `date` du schéma ont été auditées : c'était le seul cas.
- Chaîne complète validée en production sur FAC-2026-0003 : routeur n8n (branche `invoice.sent`) → `email_invoice_sent_v1` → `Has PDF?` en branche `true` → téléchargement R2 sans credential → pièce jointe de 3467 octets (`%PDF-`) → Resend accepté (`bcff7a45-8a1a-4c3e-98cf-41bb218c294c`).


### Fixed — Le routeur n8n ne pouvait pas être publié
- Les 15 nœuds `executeWorkflow` de `router_dispatch_v1` référençaient leur sous-workflow avec `mode: "name"`. n8n ne résout que `list`, `id` et `url` : la référence était donc **impossible à résoudre**, et l'import échouait à la publication avec « references workflow X which is not published » pour chaque branche, alors que tous les sous-workflows étaient bien publiés.
- `n8n/scripts/lint.ts` refuse désormais tout mode que n8n ne sait pas résoudre, pour que le dépôt ne puisse plus livrer un routeur impubliable.
- `n8n/scripts/resolve-workflow-ids.ts` (`pnpm n8n:resolve-ids`) interroge l'instance et réécrit les références en `mode: "id"`. Les identifiants étant propres à chaque instance, ils ne peuvent pas être versionnés ; le script signale les noms introuvables et les doublons plutôt que d'en choisir un au hasard.


### Added — Logo d'organisation dans les emails
- `GET /api/v1/organizations/:id/logo` : route publique, non authentifiée, qui sert le logo depuis R2. Volontairement pas d'URL présignée — elle expire en une heure, et un client ouvrant son devis trois jours plus tard verrait une image cassée. Un logo n'est pas un secret.
- La route ne sert que le fichier déclaré dans `logo_file_id`, et seulement s'il s'agit d'une image `ready` appartenant à cette organisation. Sans ces deux contrôles, elle permettrait de lire n'importe quel objet du bucket par identifiant. Limitée par IP, `nosniff`, cache long.
- `POST` / `DELETE` sur le même chemin définissent et retirent le logo (permission `org.update`). Le contournement du middleware est restreint à `GET`.
- Champ d'upload dans Réglages → Général : présignage, envoi direct vers R2, analyse antivirus, puis rattachement. 2 Mo maximum, PNG/JPEG/WebP/GIF.
- `payload.org.logoUrl` est enfin renseigné. Les templates MJML lisaient `{{org.logoUrl}}` depuis le début, mais le payload ne portait que `name` et `brandColor` : **aucun email n'a jamais affiché de logo**.


### Added — Écran Fichiers
- `/dashboard/files` : liste des documents de l'organisation, recherche par nom, filtre par type, envoi, téléchargement et suppression. Les routes d'upload et de téléchargement existaient, mais **aucune ne permettait d'énumérer les fichiers** : tout ce qu'une organisation stockait sur R2 était inatteignable depuis l'interface.
- Route `GET /api/v1/files` : liste paginée avec `kind`, `status` et `search`, plus le total d'octets calculé en SQL sur l'organisation entière (et non sur la page renvoyée).
- L'envoi passe par un PUT présigné directement vers R2 : le fichier ne transite pas par le serveur applicatif. Type MIME, taille et quota de stockage restent validés côté serveur au moment du présignage.
- `POST /api/v1/uploads/presign` passait la chaîne `'system'` comme `uploaded_by_user_id` en l'absence d'utilisateur (cas clé API), ce qui violait la clé étrangère uuid. La colonne étant nullable, `null` est désormais transmis.

### Added — Parcours d'invitation d'équipe
- Page publique `/invite/[token]` : nom de l'organisation, auteur de l'invitation, rôle proposé, et acceptation en un clic. Le jeton était généré et stocké mais **aucun email n'était envoyé et aucun écran ne permettait de l'accepter** — un invité ne pouvait jamais rejoindre une organisation.
- Événement `invitation.sent`, template MJML `invitation_sent/fr`, workflow `email_invitation_sent_v1` et branche dans `router_dispatch_v1`.
- `lib/invitations/index.ts` : création d'invitation partagée entre `POST /api/v1/organizations/[slug]/invitations` et le formulaire du tableau de bord. Les deux chemins divergeaient ; seul l'un vérifiait le quota de membres.
- L'inscription accepte `inviteToken` : un invité sans compte rejoint l'organisation qui l'a invité au lieu de s'en voir créer une nouvelle.

### Security — Invitations et redirections d'authentification
- `POST /api/v1/invitations/accept` refuse désormais une invitation dont l'adresse ne correspond pas au compte connecté (`403 EMAIL_MISMATCH`). Un lien transféré ou intercepté permettait à n'importe quel titulaire de compte d'entrer dans l'organisation.
- Le champ `redirect` des formulaires de connexion et d'inscription était collecté puis ignoré. Il est maintenant honoré, restreint aux chemins internes (`/…`, jamais `//…`) pour éviter une redirection ouverte.

### Security — Réinitialisation de mot de passe
- **Le jeton de réinitialisation était `reset-password-<userId>`**, non stocké, sans expiration et sans usage unique : toute personne connaissant l'UUID d'un utilisateur pouvait changer son mot de passe. Remplacé par un jeton aléatoire de 32 octets, stocké en SHA-256 dans la nouvelle table `password_reset_tokens`, valable une heure et à usage unique (migration `0007`).
- Une nouvelle demande invalide les liens précédents ; la réinitialisation révoque toutes les sessions de l'utilisateur.

### Added — Écrans de mot de passe oublié
- Pages `/forgot-password` et `/reset-password`, lien « Mot de passe oublié ? » sur `/sign-in`. La confirmation est identique que l'email existe ou non, pour ne pas divulguer les comptes enregistrés.
- Événement `user.password_reset_requested`, template MJML `password_reset_requested/fr`, workflow `email_password_reset_requested_v1` et branche correspondante dans `router_dispatch_v1`. Aucun email n'était envoyé auparavant.
- `emit()` accepte `organizationId = null` pour les événements de compte, qui n'appartiennent à aucune organisation et ne visent que l'endpoint global `n8n_primary`.
- `app/(login)/auth-shell.tsx` : mise en page commune aux écrans non authentifiés.

### Added — Rétrogradation d'abonnement en libre-service (MVP6)
- `cancelSubscription()` / `resumeSubscription()` dans `lib/billing/saas-billing.service.ts`, exposés par `POST /api/v1/billing/cancel` et `POST /api/v1/billing/resume`. La rétrogradation est programmée en fin de période payée (`cancel_at_period_end`), sans remboursement ni proratisation, et reste réversible jusqu'à l'échéance.
- `getSubscription()` applique la bascule vers `free` à la lecture quand la période est échue : la rétrogradation ne dépend pas de la présence d'un cron.
- Écran Abonnement : le bouton du forfait Gratuit ouvre une confirmation explicite (limites reprises, absence de remboursement) ; une bannière signale la rétrogradation programmée avec sa date d'effet et permet de la reprendre.

### Fixed — Souscription aux forfaits payants
- `POST /api/v1/billing/subscribe` : le contrat divergeait de l'appelant (`targetPlanId` envoyé contre `planId` attendu, `organizationId` absent, réponse imbriquée dans `data`). Les boutons « Passer à Pro » et « Passer à Business » échouaient en `400`. L'organisation est désormais lue dans le contexte de requête et non dans le corps.
- `formatErrorResponse` traduit `BillingServiceError` en son propre code HTTP au lieu d'un `500` générique.

### Added — Reprise des livraisons webhook (MVP5 §6)
- `retryDueDeliveries()` dans `lib/webhooks/index.ts` : rejoue les livraisons dont le `next_retry_at` est échu et les `pending` abandonnées depuis plus de 15 min (le dispatch fire-and-forget ne survit pas au gel du lambda). `next_retry_at` était calculé à chaque échec mais **relu par personne** : une livraison mourait après un seul essai, sans trace ni alerte.
- Réclamation concurrente sûre : `FOR UPDATE SKIP LOCKED` + bail de 10 min posé sur `next_retry_at`. Deux exécutions simultanées ne peuvent pas envoyer deux fois le même webhook, et une exécution interrompue libère ses lignes à l'expiration du bail au lieu de les bloquer.
- Endpoint `POST /api/internal/cron/webhook-retries`, hors `/api/v1` (le sweep est global, il n'appartient à aucun tenant). Authentifié par `CRON_SECRET` en bearer, comparaison à temps constant, fail closed si la variable est absente, rate limit par IP.
- Workflow `n8n/workflows/cron_webhook_retries_v1.json` (Schedule 5 min) et variable `CRON_SECRET` documentée dans `.env.example`.
- Livraison at-least-once assumée : le payload conserve son `id` d'événement d'origine, ce qui permet au consommateur de dédupliquer.

### Fixed — Correctifs bloquants
- `lib/webhooks/index.ts` : normalisation profonde du payload (`toJsonSafe`) avant insertion outbox, signature HMAC et envoi HTTP. Les `bigint` renvoyés par drizzle faisaient jeter `JSON.stringify` à l'insertion dans `webhook_deliveries.payload`, à l'intérieur de la transaction de `createQuote`/`createInvoice` — d'où un `500` sur la création de devis et de factures.
- Middleware : `/api/v1/auth/*`, `/api/v1/invitations/accept` et les webhooks authentifiés par HMAC ne sont plus interceptés par le contrôle d'auth (ils répondaient `401` avant leur handler).
- Middleware : purge des en-têtes d'auth internes fournis par le client avant transmission aux handlers.
- `lib/payments/credentials.service.ts` : suppression de la clé KEK de repli codée en dur. L'absence de `PAYMENT_CREDENTIALS_KEK` échoue désormais explicitement.
- `components/nav-user.tsx` : la déconnexion et les entrées du menu utilisateur étaient inertes — aucun moyen de se déconnecter depuis l'interface. `signOut` purge aussi le cookie `organization_id`.
- Sérialisation des colonnes `bigint` sur les routes dépenses et livrables (elles renvoyaient `500`).
- `.env.example` : aligné sur les variables réellement lues (ajout des `EXCELLENCE_GENIUSPAY_*` et `NEXT_PUBLIC_APP_URL`, retrait des `STRIPE_*` et `GENIUS_SANDBOX_*` orphelines).

### Added — Modules métier dans l'interface (MVP3)
- Écrans `/dashboard/contracts`, `/dashboard/deliverables`, `/dashboard/expenses` et `/dashboard/reviews`, branchés sur les routes `/api/v1` existantes ; les quatre modules sont ajoutés à la barre latérale.
- Route `GET /api/v1/deliverables` (liste à l'échelle de l'organisation) réutilisant `listDeliverables`.
- `app/(dashboard)/dashboard/_components/module-ui.tsx` : helpers partagés (badges de statut, formats, en-tête, carte KPI) des nouveaux écrans.

### Added — Enforcement des quotas (MVP6)
- `assertQuota` est appliqué à la création de clients, projets, clés API, invitations et adhésions ; `recomputeQuotaUsage` maintient les compteurs à jour.
- `QuotaExceededError` est traduit en `403 QUOTA_EXCEEDED` par `formatErrorResponse` (il produisait un `500`).
- Métrage mensuel des appels API dans le middleware via `incrementPeriodUsage`.
- Palier de rate limiting `business` ajouté (`enterprise` conservé comme alias).

### Added — Étape 5 PR1 : Infrastructure n8n
- Endpoint webhook entrant `POST /api/v1/webhooks/excellence-events` (verify HMAC + idempotence Redis, MVP5 §2.3/§6).
- Migration `0005_n8n_endpoint` : `webhookEndpoints.organization_id` nullable + colonne `kind` (`n8n_primary`).
- Helper d'idempotence `lib/notifications/redis-idempotency.ts` (Upstash Redis, TTL 24h, fallback in-memory).
- Helper de vérification HMAC `lib/notifications/webhook-verify.ts` (format `t=<ts>,v1=<hex>`, fenêtre 5 min).
- Workflows n8n versionnés : `router_dispatch_v1.json`, `healthcheck_v1.json` (`/n8n/workflows/`).
- Scripts `n8n/scripts/deploy.ts` (push API n8n) et `n8n/scripts/lint.ts` (validation JSON).
- ADR `docs/adr/0007-n8n-orchestration.md`.
- Tests unitaires `tests/integration/n8n-webhook-verify.test.ts`.

### Added — Étape 5 PR2 : Emails transactionnels
- 13 workflows email n8n (`email_*.json`) : rendu depuis payload → fetch PDF optionnel → envoi Resend (HTTP Request `api.resend.com/emails`).
- Router mis à jour (`router_dispatch_v1.json`) : 13 nodes Execute Workflow câblés au Switch par event.
- 13 templates MJML FR dans `n8n/email-templates/<name>/fr/` (subject + body).
- Provider email figé : **Resend** (MVP5 §4), expéditeur `no-reply@notifications.excellence.app`.
