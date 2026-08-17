# Plan d'action — Refonte complète Contravo (UI / Identité / Copy)

> Document de planification — aucune ligne de code. Établi selon les standards des skills `ui-ux-pro-max`, `frontend-design` et `copywriting` (référentiels : `.claude/skills/`).
> Date : 17/08/2026 — Version : 2.0 (direction « Le cachet » — vif, adoptée)

---

## 0. Contexte

**Produit** : Contravo — plateforme B2B SaaS pour prestataires francophones (Afrique de l'Ouest et centrale) : gestion de devis, contrats, factures, livrables et paiements (GeniusPay, XOF). Multi-tenant (organisations/membres/rôles), portail client de signature, webhooks n8n (emails transactionnels).

**État actuel (constats)**
- Landing : dérivée du template « Finwise » (gris/bleu générique, Inter) — pas d'identité propre.
- App : style « Coinbase blue » (`#0052ff`), Inter, composants shadcn non configurés (design tokens par défaut).
- Design tokens dispersés : classes hexadécimales en dur dans les pages (`bg-[#0052ff]`, `text-[#5b616e]`…) — pas de système de tokens sémantiques.
- Copy de l'app : anglais (« Team Settings », « Invite Team Member », « Remove ») alors que le produit est francophone ; labels incohérents avec les états (`Submit`, `Get Started`).
- Bugs UI à intégrer au périmètre (cf. `docs/analyse-erreurs-bloquantes.md`) : `removeChild` framer-motion (GooeyInput), `quoteNumber`/`invoiceNumber` vs `number` API, warning preload `next/font`.

**Cible** : une identité propre, vive et distinctive, ancrée dans l'univers du produit : le document signé, l'argent qui en découle et l'énergie du commerce ouest-africain (mobile money, le « cachet » que tout vendeur utilise).

---

## 1. Direction de design (thèse)

### Signature du produit : « Le cachet »

Le cachet (rubber stamp) est l'objet que tout le monde reconnaît dans la vente en Afrique de l'Ouest : le document tamponné « PAYÉ », « SIGNÉ » fait foi. C'est le geste de clôture d'une transaction.

1. **Le papier chaud** — fond papier lumineux (`#FFF6E9`) : les surfaces sont des « feuilles » de document.
2. **L'encre chocolat** — un noir chaud (`#21160F`) pour le texte et les titres.
3. **Le corail (l'action)** — `#F04E23` pour tout ce qui crée, envoie, transforme : boutons « Créer un devis », « Envoyer la facture ».
4. **Le vert mobile money (l'argent)** — `#0E9F6E` exclusivement pour le paiement, le succès, « Signé / Payé ».
5. **Le soleil (l'attention)** — `#C77E00` pour « En attente », relances, intermédiaires.

**Signature mémorable** : les statuts de documents sont des **tampons « cachet »** — « SIGNÉ », « PAYÉ », « EN ATTENTE », « REFUSÉ » — rendus comme de vrais tampons (légère rotation, bordure épaisse, font mono). Au changement de statut, le tampon s'applique avec un petit impact (spring 250–300ms) : c'est le moment que l'on retient. Deuxième signature : tous les montants et numéros de documents (DEV-2026-0042, FAC-2026-0107) en **IBM Plex Mono** tabulaire — « les chiffres du contrat ».

**Risque assumé** : le corail en couleur primaire au lieu du bleu SaaS standard. Justifié : le public (freelances, agences, artisans digitaux) est jeune et mobile-first ; le corail + soleil racontent l'énergie du mobile money (Orange Money, MTN MoMo) sans copier leurs marques.

**Anti-patterns à éviter** (ui-ux-pro-max + frontend-design) :
- Le trio par défaut « cream + serif terracotta », « noir + acid green », « broadsheet ».
- Dégradés violet/rose « AI », ombres décoratives, émojis comme icônes, numéros « 01/02/03 » décoratifs.
- Jaune utilisé en texte (illisible) — uniquement en fond de badge ou en trait.
- Corail partout — le corail est l'action, le vert est l'argent, le soleil est l'attente. Chaque couleur a UN rôle.

---

## 2. Design system — tokens

### 2.1 Couleurs (mode clair)

| Rôle | Token | Hex | Usage |
|---|---|---|---|
| Fond (papier chaud) | `--background` | `#FFF6E9` | fond de page, lumineux mais chaud |
| Surface (feuille) | `--card` / `--popover` | `#FFFFFF` | cartes, modales, inputs |
| Surface atténuée | `--muted` | `#F5EAD8` | hover de lignes, sections secondaires |
| Bordure (fil) | `--border` / `--input` | `#EADCC4` | hairlines, séparateurs |
| Texte principal (encre chocolat) | `--foreground` | `#21160F` | corps de texte |
| Texte atténué | `--muted-foreground` | `#6B5B4E` | légendes, placeholders |
| Primaire (corail) | `--primary` | `#F04E23` | boutons d'action, CTA, liens forts |
| Sur primaire | `--primary-foreground` | `#FFFFFF` | (contraste UI ≥ 3:1 — réservé aux gros éléments, jamais de texte 12px en corail) |
| Accent (vert mobile money) | `--accent` | `#0E9F6E` | paiement, succès, « Signé / Payé », focus |
| Accent hover | (dérivé) | `#0B8159` | hover des boutons verts |
| Accent doux | (dérivé) | `#E0F3EA` | fonds de badges succès |
| Attention (soleil) | `--warning` | `#C77E00` | « En attente », relances |
| Attention doux | (dérivé) | `#FBEFD8` | fonds de badges attention |
| Destructif | `--destructive` | `#D9342E` | suppression, refus |
| Destructif doux | (dérivé) | `#FBE5E3` | fonds de badges erreur |
| Focus/ring | `--ring` | `#F04E23` | focus clavier (3-4px, contraste ≥ 3:1) |
| Info (liens) | (dérivé) | `#1A5FA8` | liens, aider |

**Règle sémantique** : le vert ne sert **que** à l'argent/au succès ; le corail **que** à l'action ; le soleil **que** à l'attente. Le statut d'un document ne s'exprime jamais par la couleur seule (toujours icône ou libellé — et idéalement le cachet).

### 2.2 Couleurs (mode sombre)

| Rôle | Hex |
|---|---|
| Background (nuit chaude) | `#191008` |
| Surface | `#241810` |
| Surface atténuée | `#2E2013` |
| Bordure | `#3A2C1D` |
| Foreground | `#F6EDE3` |
| Muted foreground | `#A8937F` |
| Primaire (corail relevé) | `#FF6A3D` |
| Accent (vert relevé) | `#22B083` |
| Warning (soleil relevé) | `#E8A92E` |
| Destructif | `#E8685A` |

Contraste minimum vérifié : 4.5:1 (texte) / 3:1 (grand texte et UI) dans les deux modes.

### 2.3 Typographie

| Rôle | Police | Usage |
|---|---|---|
| Display / Titres | **Bricolage Grotesque** (variable 200–800) | hero en 700–800, titres en 600 — énergique et typé, jamais sage |
| UI / Corps | **Instrument Sans** (400–600, latin-ext ✓) | boutons, inputs, navigation, corps |
| Chiffres / Codes | **IBM Plex Mono** (400–600) | montants, numéros de documents, codes, identifiants, tampons |

**Échelle type** (base 16px, lh 1.5) :
- Display : 56–72px (desktop) / 36–44px (mobile), tracking normal (le vif respire — pas de -0.02em serré)
- H1 : 32–40px — H2 : 24–30px — H3 : 20–22px — corps : 16px — petit : 14px — légende : 13px
- Labels UI : 13–14px, sentence case
- Montants : mono 15–17px semi-bold, tabulaire, même alignement décimal

**Mise en œuvre** : remplacer `Inter` dans `app/layout.tsx` par `Bricolage Grotesque` + `Instrument Sans` + `IBM Plex Mono` via `next/font/google` avec `preload: false` (corrige au passage le warning `<link rel=preload> must have a valid as value`). Déclarer les familles dans le `@theme` de Tailwind v4 (`app/globals.css`). Fallback si problème de subsets : `Space Grotesk` en display.

### 2.4 Forme, espacement, profondeur

- **Rayons** : 12px (cartes), 8px (inputs/boutons), 999px (badges/pills).
- **Espaces** : échelle 4px (4–8–12–16–24–32–48–64–96). Densité standard (16–64px), plus serrée (8–32px) dans les tables.
- **Ombres** : hairlines (`border`) + ombre douce discrète (`0 1px 2px rgb(33 22 15 / 0.06)`) — le papier ne lévite pas.
- **Tampons** : composant `Stamp` dédié (bordure 2px, coin supérieur gauche plié, rotation -2°, font mono uppercase, `aria-label` explicite).

### 2.5 Motion (vive mais disciplinée)

- **Impact du cachet** : spring 250–300ms, scale 1.15 → 1 + rotation finale, au changement de statut uniquement.
- Entrées en fondu + 12px max, 150–300ms, easing `cubic-bezier(0.2, 0, 0, 1)`.
- CTA : léger scale 1.02 au survol ; boutons pressés 0.98.
- Pas d'animation de `width`/`height` ; `prefers-reduced-motion` : tampon statique, entrées en fondu simple.
- **Corriger au passage** : le bug `removeChild` de `components/ui/gooey-input.tsx` (doublon de `layoutId` + unmount conditionnel) — voir étape S6.

---

## 3. Copy — langue et ton

### 3.1 Principes appliqués (copywriting + frontend-design)

- **Le produit passe au français** : toute l'app (dashboard, portail client, emails via n8n).
- Ton **punchy et conversationnel** : « Votre client vient de signer. », « Encaissé, c'est noté. » — mais jamais de jargon marketing vide.
- Clarté > créativité ; bénéfice > fonctionnalité ; verbe actif ; nommer ce que l'utilisateur contrôle.
- Cohérence du vocabulaire : « Devis », « Facture », « Contrat », « Client », « Projet », « Signature ». Le bouton et son toast disent la même chose : « Tamponner comme payée » → « Facture tamponnée comme payée ».
- États vides = invitations à agir ; erreurs = explication + correction, sans s'excuser.

### 3.2 Landing (page d'accueil)

| Section | Copy proposée (FR) | Justification |
|---|---|---|
| **Hero** | Titre : « Faites signer vos devis. Encaissé plus vite. » Sous-titre : « Créez un devis en 5 minutes, envoyez le lien, votre client signe depuis son téléphone et paie par mobile money. » CTA primaire : « Créer mon premier devis » · CTA secondaire : « Voir un exemple » | CTA = action + ce qu'on obtient ; transformation immédiate |
| **Hero visuel** | Carte « devis » vivante : numéro mono « DEV-2026-0042 », total vert, **cachet « EN ATTENTE »** qui bascule en « SIGNÉ » au scroll/au clic | la signature du produit, montrée dès la première seconde |
| **Preuve** | « 3 documents créés par jour », « 4× plus vite encaissé », « 100 % de signatures en ligne » (chiffres à valider avec le fondateur) + logos clients | crédibilité chiffrée |
| **Problème** | « Encore en train de relancer votre client pour une signature ? » — devis envoyé par WhatsApp, jamais signé, paiement à la traîne | question rhétorique, miroir de la situation vécue |
| **Solution** | 3 bénéfices : « Devis en 5 minutes » (modèles, montants calculés seuls) · « Signature en ligne » (lien sécurisé, aucune inscription pour le client) · « Paiement direct » (GeniusPay, mobile money, suivi automatique) | bénéfices → transformation |
| **Comment ça marche** | 3 étapes : 1. Choisir un modèle · 2. Envoyer le lien · 3. Être payé — chaque étape avec son cachet | réduit la complexité perçue |
| **Objections / FAQ** | « Le client doit-il créer un compte ? — Non, il signe en 30 secondes depuis son téléphone. » « Quels moyens de paiement ? — Mobile money (Orange, MTN, Moov…), carte, via GeniusPay. » « Mes documents sont-ils protégés ? — Signature horodatée, copies conservées. » | lève les freins principaux |
| **CTA final** | « Prêt à vendre plus vite ? » + « Créer mon premier devis gratuit » | rappel de la valeur + CTA répété |

Titres alternatifs (à tester) : A) « Le devis qui se signe tout seul. » — mémorable, risque : trop malin. B) « Signez, encaissez, avancez. » — punchy, risque : trop court. C) « Fini les devis sans réponse. » — orienté problème.

### 3.3 App (navigation, états, erreurs)

- **Navigation** : « Tableau de bord », « Devis », « Factures », « Contrats », « Projets », « Clients », « Livrables », « Facturation », « Développeurs », « Équipe ».
- **Boutons** : « Créer un devis », « Envoyer la facture », « Marquer comme payée » (ou « Tamponner comme payée » — à tester), « Dupliquer », « Archiver ».
- **États vides** : « Aucun devis pour l'instant. Créez le premier, il s'envoie en 5 minutes. » + bouton « Créer un devis ».
- **Erreurs** : « Le client est introuvable. Vérifiez qu'il n'a pas été supprimé, puis réessayez. » (jamais « Une erreur est survenue »).
- **Statuts = cachets** : SIGNÉ / PAYÉ (vert), EN ATTENTE (soleil), REFUSÉ (rouge), BROUILLON (encre).
- **Montants** : « Montant total », « Montant payé », « Reste à payer », toujours en XOF via `Intl.NumberFormat('fr-FR')` + espace fine insécable.

---

## 4. Plan d'action en étapes

Chaque étape a : objectif · fichiers touchés · critère de sortie. Ordre = fondations → landing → app → qualité.

### Étape S0 — Fondations techniques (tokens)
- **Objectif** : installer le socle de design sans casser l'existant.
- **Actions** : remplacer `Inter` par les 3 polices (`app/layout.tsx`, `next/font` + `preload: false`) ; réécrire le `@theme` de `app/globals.css` (couleurs clair/sombre, rayons, ombres, familles, échelle) ; créer le fichier des tokens sémantiques ; fusionner/supprimer `globals.css.slate-violet`.
- **Fichiers** : `app/layout.tsx`, `app/globals.css`, `components.json`, `next.config.ts` (décision PPR à confirmer avec le warning preload).
- **Sortie** : tokens déclarés, pas d'usage direct d'hex dans les composants ; les pages affichent encore l'ancien look (acceptable).

### Étape S1 — Composants design system (shadcn)
- **Objectif** : mettre à niveau les primitives sur les nouveaux tokens.
- **Actions** : re-thémer Button, Badge, Card, Input, Select, Dialog, Table, Tabs, Tooltip, Sidebar, Chart (palette recharts : corail/vert/soleil/rouge), Toast (sonner), Skeleton ; ajouter les variantes « accent » (vert) et « warning » (soleil) aux badges ; **créer le composant `Stamp` (cachet)** ; typo tabulaire mono pour les montants.
- **Fichiers** : `components/ui/*`, `components.json`, `components/stamp.tsx` (nouveau).
- **Sortie** : kit complet cohérent, contrastes ≥ 4.5:1, focus visibles, hover 150–300ms.

### Étape S2 — Landing page
- **Objectif** : nouvelle identité visible en public (page d'accueil).
- **Actions** : réécrire `app/(landing)/page.tsx` + sections (`_components/header.tsx`, `sections.tsx`, `faq-footer.tsx`) sur la structure §3.2 ; hero = **carte « devis » vivante avec cachet animé** (EN ATTENTE → SIGNÉ au clic/scroll) ; primitives motion adoucies (`motion.tsx` : fondu + 12px, `prefers-reduced-motion`) ; copy française complète ; metadata + OG tags.
- **Fichiers** : `app/(landing)/*`, `components/hero-section-demo-1.tsx`, `app/layout.tsx` (metadata : titre « Contravo — Devis, contrats et factures signés en ligne », meta description FR).
- **Sortie** : landing responsive (375/768/1024/1440), copy FR, hero avec cachet distinctif, Lighthouse ≥ 90 perf/a11y.

### Étape S3 — Coquille applicative (dashboard)
- **Objectif** : l'app « respire » le même système.
- **Actions** : thème sombre fonctionnel (`next-themes` déjà présent) ; refonte `components/app-sidebar.tsx`, `components/nav-user.tsx`, `components/team-switcher.tsx` (papier chaud/encre) ; suppression des classes hexadécimales en dur dans la coquille.
- **Fichiers** : `components/app-sidebar.tsx`, `components/nav-user.tsx`, `components/team-switcher.tsx`, `app/(dashboard)/layout.tsx`.
- **Sortie** : navigation claire (≤ 7 items au premier niveau, icône + libellé, état actif visible), dark mode sans perte de contraste.

### Étape S4 — Pages métier
- **Objectif** : uniformiser les écrans de gestion.
- **Actions** : appliquer tokens + typo + copy FR à : Tableau de bord (`dashboard/page.tsx`), Devis, Factures, Clients, Projets, Contrats, Livrables, Facturation/Billing, Développeurs, Équipe, Admin ; **remplacer les badges de statut par le composant `Stamp`** ; montants en mono (vert = payé, encre = en attente) ; tables avec hairlines papier.
- **Fichiers** : `app/(dashboard)/dashboard/**`, `app/admin/**` (aucun changement côté `app/api/**` — présentation seule).
- **Sortie** : aucune classe hexadécimale restante dans `app/(dashboard)` ; toutes les pages en FR ; numéros de documents affichés correctement.

### Étape S5 — États et expérience
- **Objectif** : la qualité perçue (vides, erreurs, chargements, feedbacks).
- **Actions** : états vides illustrés (copy §3.3) ; toasts cohérents (« Devis créé », « Devis envoyé », « Facture marquée comme payée ») ; skeletons alignés ; états de chargement des boutons ; **corriger le mismatch `quoteNumber`/`invoiceNumber` → `number`** dans `quotes/page.tsx` et `invoices/page.tsx` ; portail client (`app/portal/**`) passé en FR avec la même identité (cachets visibles côté client : « Signez ici »).
- **Fichiers** : pages dashboard + portal.
- **Sortie** : aucun « undefined » visible, aucun toast anglais, chaque action a un retour visible < 300ms.

### Étape S6 — Motion, accessibilité, performance, QA
- **Objectif** : la check-list pro avant livraison.
- **Actions** :
  1. **Corriger le bug `removeChild`** : `components/ui/gooey-input.tsx` — supprimer le doublon de `layoutId` (deux `SearchIcon` partageant le même id avec unmount conditionnel) ou maintenir l'icône montée en changeant la visibilité CSS.
  2. **Accessibilité** : check-list ui-ux-pro-max (contrastes, focus clavier visible, `aria-label` sur boutons icônes, cibles ≥ 44×44px, `prefers-reduced-motion`, skip-link, navigation clavier des modales). Le cachet : `aria-label` + texte réel, jamais un simple visuel.
  3. **Performance** : images AVIF/WebP lazy, pas de CLS (réserves d'espace), ne garder qu'un des deux bundles (`framer-motion` vs `motion`).
  4. **Tests** : `pnpm test` (vitest) vert ; `pnpm build` sans warning.
- **Fichiers** : `components/ui/gooey-input.tsx`, tous les fichiers touchés en audit.
- **Sortie** : checklist S6 à 100 %, 0 erreur console (preload, removeChild, Violation).

---

## 5. Check-list de sortie (à cocher à chaque étape)

- [ ] Aucun hex en dur dans les composants (tokens uniquement)
- [ ] Contraste texte ≥ 4.5:1, UI ≥ 3:1 (les deux modes)
- [ ] Focus clavier visible partout, cibles tactiles ≥ 44×44px
- [ ] `prefers-reduced-motion` respecté
- [ ] Responsive 375 / 768 / 1024 / 1440, pas de scroll horizontal
- [ ] Icônes SVG Lucide, pas d'émoji, `aria-hidden` sur décoratives
- [ ] Copy FR cohérente (bouton ↔ toast ↔ état vide), aucun « Submit / Get Started »
- [ ] Statuts exprimés par cachet + libellé, jamais la couleur seule
- [ ] Montants en mono tabulaire + `Intl.NumberFormat('fr-FR')`, symétrie « Montant payé / Reste à payer »
- [ ] Vert = argent/succès · Corail = action · Soleil = attente — chaque couleur un seul rôle
- [ ] Aucun warning console (preload, removeChild, Violation)
- [ ] `pnpm test` vert, `pnpm build` sans warning

---

## 6. Risques et dépendances

| Risque | Mitigation |
|---|---|
| Corail comme couleur primaire = choix audacieux | Le tester sur la landing (S2) avant d'étendre à l'app ; repli Vert+Encre si réticence client institutionnel |
| Bricolage Grotesque en latin-ext peut alourdir les fonts | `display: swap`, sous-ensembles `latin-ext` seuls, `preload: false` ; fallback Space Grotesk |
| Changement de copy = risques SEO (landing FR) | Réécrire meta + OG tags dans la même étape S2, pas de page cassée |
| Bugs bloquants (§ analyse-erreurs-bloquantes) | Les traiter hors périmètre UI, avant ou en parallèle de S0 |
| Cachet animé trop répété | Un impact par changement de statut, jamais sur chaque carte au rendu |
