/**
 * Landing page copy (direction « Le cachet » — v1.1).
 *
 * Tout ce qui est montré publiquement vit ici : la formulation change sans
 * toucher à la mise en page.
 *
 * **Règle de ce fichier : ne rien affirmer que le produit ne fasse.** La bande
 * de chiffres qui ouvrait la page — « 3 documents par jour », « 4× plus vite
 * encaissé », « 100 % de signatures en ligne » — n'était sourcée nulle part et
 * a été retirée. Elle reviendra quand les bêta-testeurs l'auront remplie.
 *
 * Les opérateurs cités sont ceux du **Bénin** (MTN, Moov, Celtiis). Orange
 * Money n'y opère pas : c'est la Côte d'Ivoire et le Sénégal.
 */

export const siteDetails = {
  name: 'Contravo',
  tagline: 'Faites signer vos devis. Encaissé plus vite.',
  description:
    'Créez un devis en 5 minutes, envoyez le lien, votre client signe depuis son téléphone et paie par mobile money. Devis, contrats, factures et paiements pour prestataires francophones.',
};

export const heroDetails = {
  heading: 'Faites signer vos devis. Encaissé plus vite.',
  subheading:
    'Créez un devis en 5 minutes, envoyez le lien, votre client signe depuis son téléphone et paie par mobile money.',
  primaryCta: { label: 'Créer mon premier devis', href: '/sign-up' },
  secondaryCta: { label: 'Voir un exemple', href: '#etapes' },
  trustLine: 'Sans carte bancaire · Sans inscription pour vos clients',
};

/**
 * Ce qui remplace les trois chiffres inventés.
 *
 * Une phase de test annoncée franchement vaut mieux qu'une statistique que
 * personne ne peut vérifier — et que le premier client curieux demandera.
 */
export const statusLine = {
  text: 'En test à Cotonou auprès des premiers freelances et agences.',
  detail: 'Accès gratuit pendant toute la durée du test.',
};

export const problemDetails = {
  heading: 'Encore en train de relancer votre client pour une signature ?',
  subheading:
    'Devis envoyé sur WhatsApp, jamais signé, paiement à la traîne. La vente reste bloquée par l’administratif.',
  pains: [
    'Votre devis se perd dans les conversations',
    'Le client ne sait pas comment signer',
    'Vous relancez, le paiement traîne',
  ],
};

/** Ton du cachet porté par la donnée — la page ne le redevine pas. */
export type StampLabel = { stamp: string; stampTone: 'success' | 'warning' | 'ink' };

export const solutionDetails = {
  heading: 'Tout ce qu’il faut pour être payé, sans friction.',
  benefits: [
    {
      stamp: 'MODÈLE',
      stampTone: 'ink' as const,
      title: 'Devis en 5 minutes',
      description:
        'Des modèles prêts à l’emploi, les montants se calculent tout seuls. Numérotation et PDF généré automatiquement.',
      icon: 'FileText' as const,
    },
    {
      stamp: 'SIGNÉ',
      stampTone: 'success' as const,
      title: 'Signature en ligne',
      description:
        'Un lien sécurisé, aucune inscription pour votre client : il signe en 30 secondes depuis son téléphone.',
      icon: 'PenLine' as const,
    },
    {
      stamp: 'PAYÉ',
      stampTone: 'success' as const,
      title: 'Payé, vérifié',
      description:
        'Mobile Money (MTN, Moov, Celtiis) et carte bancaire, en FCFA, via GeniusPay. Le règlement est vérifié par nos serveurs avant que la facture passe en « payée » : plus de validation sur une capture d’écran.',
      icon: 'Receipt' as const,
    },
  ],
};

export const stepsDetails = {
  heading: 'Comment ça marche',
  steps: [
    {
      stamp: 'MODÈLE',
      stampTone: 'ink' as const,
      title: 'Choisir un modèle',
      description: 'Sélectionnez un modèle, ajoutez vos prestations. Les totaux se calculent seuls.',
    },
    {
      stamp: 'LIEN',
      stampTone: 'warning' as const,
      title: 'Envoyer le lien',
      description: 'Votre client le reçoit par email ou WhatsApp, consulte et signe sans compte.',
    },
    {
      stamp: 'PAYÉ',
      stampTone: 'success' as const,
      title: 'Être payé',
      description: 'La facture part, le règlement arrive par mobile money, les relances s’arrêtent.',
    },
  ],
};

/**
 * Bloc « Preuve » — le plus important de la page.
 *
 * Il répond à la seule question qui compte quand on confie ses contrats à un
 * inconnu : et le jour où ça tourne mal ? Chaque promesse ici correspond à une
 * mécanique réelle — l'empreinte SHA-256 est calculée dans `lib/pdf/render.ts`,
 * les événements de domaine tracent le cycle complet, le PDF est généré et
 * téléchargeable.
 */
export const proofDetails = {
  label: 'LA PREUVE',
  heading: 'Un devis signé chez nous, c’est un document opposable',
  intro:
    'Ce n’est pas un PDF envoyé sur WhatsApp. Chaque signature est horodatée, archivée, et rattachée au devis exact que votre client a vu au moment où il a signé.',
  lead: 'Le jour où un client conteste, vous ne cherchez pas dans une conversation vieille de trois mois. Vous ouvrez le dossier.',
  points: [
    {
      title: 'Horodatage',
      description:
        'Date, heure et document signé, conservés tels quels. Le fichier porte une empreinte SHA-256 qui prouve qu’il n’a pas changé depuis.',
    },
    {
      title: 'Trace complète',
      description:
        'Devis envoyé, consulté, signé, facturé, payé. Chaque étape est enregistrée quand elle se produit, jamais reconstituée après coup.',
    },
    {
      title: 'Dossier téléchargeable',
      description:
        'Devis, contrats signés et factures s’exportent en PDF à tout moment, depuis votre tableau de bord.',
    },
  ],
};

/**
 * Tarifs — sans grille chiffrée, volontairement.
 *
 * `lib/billing/plans.ts` définit bien trois plans (0, 15 000 et 50 000 XOF/mois),
 * mais rien ne dit encore que ces montants sont les bons : l'étude de marché en
 * cours pose précisément cette question. Annoncer un prix puis le corriger coûte
 * plus cher que de l'annoncer plus tard.
 *
 * Le taux d'encaissement, lui, ne dépend pas de nous : c'est la commission de
 * GeniusPay (doc/COMPTE-EXCELLENCE.md).
 */
export const pricingDetails = {
  label: 'TARIFS',
  heading: 'Gratuit pendant la phase de test',
  body: 'Contravo est en test à Cotonou. Vous créez vos devis, vos clients signent et paient, sans rien débourser.',
  points: [
    'Aucune carte bancaire pour s’inscrire.',
    'Les tarifs seront annoncés à la fin de la phase de test, avec un préavis.',
    'L’abonnement se réglera par Mobile Money, comme le reste.',
  ],
  fees: {
    title: 'Frais sur les encaissements',
    description:
      'Une commission de 1,5 % par transaction est prélevée par GeniusPay, notre partenaire de paiement. Le montant apparaît avant chaque règlement. Contravo ne prélève rien en plus.',
  },
};

/**
 * L'équipe.
 *
 * Un visage vaut dix arguments quand on demande à quelqu'un de confier ses
 * contrats. Les photos manquent encore — `photo` reste null jusque-là plutôt
 * que de pointer vers un fichier absent.
 */
export const teamDetails = {
  label: 'L’ÉQUIPE',
  heading: 'Construit à Cotonou, pour les prestataires d’ici',
  body: 'Contravo est développé par Excellence Team, une startup étudiante béninoise. Nous ne sommes pas une équipe basée ailleurs qui adapte un outil occidental : nous vivons les mêmes devis signés sur WhatsApp et les mêmes paiements qui traînent.',
  members: [
    { name: 'Octave Bahoun', role: 'Direction technique et architecture', photo: null },
    { name: 'Jean-Baptiste Vignon Fodo', role: 'Sécurité des infrastructures', photo: null },
    { name: 'Mourchid Folarin', role: 'Sécurité applicative', photo: null },
    { name: 'Wasfade Tonokouin', role: 'Développement backend', photo: null },
  ],
  contact: {
    email: 'contact@excellenceteam.site',
    note: 'Nous répondons en français, sous 24 h ouvrées.',
  },
};

/**
 * FAQ.
 *
 * Chaque réponse a été confrontée au code avant d'être écrite. Deux promesses
 * du brief initial ont été retirées faute d'implémentation : l'export des
 * clients en tableur (le PDF existe, le CSV non) et le mode hors connexion.
 * Écrire l'inverse aurait produit exactement le reproche qu'on cherche à
 * éviter — promettre plus que ce que le produit fait.
 */
export const faqs = [
  {
    question: 'Le client doit-il créer un compte ?',
    answer:
      'Non. Il reçoit un lien, ouvre le devis et signe depuis son téléphone. Rien à installer, rien à créer. Le lien a une durée de validité limitée, pour que le document ne circule pas indéfiniment.',
  },
  {
    question: 'Quels moyens de paiement acceptez-vous ?',
    answer:
      'Mobile Money — MTN MoMo, Moov Money, Celtiis — et carte bancaire, en francs CFA, via notre partenaire GeniusPay.',
  },
  {
    question: 'Combien coûtent les encaissements ?',
    answer:
      'Une commission de 1,5 % par transaction, prélevée par GeniusPay. Le montant apparaît avant chaque paiement. Contravo ne prélève rien en plus, et il n’y a pas de frais d’ouverture.',
  },
  {
    question: 'Une signature électronique a-t-elle une valeur juridique ?',
    answer:
      'Le droit OHADA, applicable au Bénin, reconnaît les contrats conclus par voie électronique. Contravo horodate chaque signature et conserve le document exact qui a été signé, avec une empreinte SHA-256 qui permet de prouver qu’il n’a pas été modifié depuis.',
  },
  {
    question: 'Mes documents sont-ils protégés ?',
    answer:
      'Les fichiers sont stockés chez Cloudflare R2 et chaque accès passe par un lien signé à durée limitée — ils ne transitent jamais en clair par nos serveurs. Chaque organisation est isolée au niveau de la base de données, et nous ne conservons pas les identifiants de paiement de vos clients.',
  },
  {
    question: 'Que deviennent mes données si j’arrête ?',
    answer:
      'Elles sont à vous. Vos devis, contrats signés et factures se téléchargent en PDF à tout moment depuis votre tableau de bord, et restent des documents valides en dehors de la plateforme. Aucune suppression sans préavis.',
  },
  {
    question: 'Ça marche sans bonne connexion ?',
    answer:
      'L’application fonctionne dans le navigateur du téléphone, sans installation, et reste légère. Elle a besoin d’une connexion pour envoyer un devis ou encaisser : le mode hors connexion n’existe pas encore.',
  },
];

export const ctaDetails = {
  heading: 'Prêt à vendre plus vite ?',
  subheading:
    'Créez votre premier devis gratuitement, envoyez-le, et regardez votre client signer.',
  primaryCta: { label: 'Créer mon premier devis gratuit', href: '/sign-up' },
};

export const footerDetails = {
  /** Ce que le pied de page dit de nous, sous les colonnes de liens. */
  signature: 'Développé au Bénin par Excellence Team.',
  columns: [
    {
      title: 'Produit',
      links: [
        { label: 'Fonctionnalités', href: '/#fonctionnalites' },
        { label: 'Comment ça marche', href: '/#etapes' },
        { label: 'FAQ', href: '/#faq' },
      ],
    },
    {
      title: 'Compte',
      links: [
        { label: 'Se connecter', href: '/sign-in' },
        { label: 'Créer un compte', href: '/sign-up' },
      ],
    },
    {
      title: 'Développeurs',
      links: [{ label: 'Documentation API', href: '/api/v1/docs' }],
    },
    {
      title: 'Contact',
      links: [
        { label: 'contact@excellenceteam.site', href: 'mailto:contact@excellenceteam.site' },
        { label: 'L’équipe', href: '/#equipe' },
      ],
    },
    {
      title: 'Légal',
      links: [
        { label: 'Mentions légales', href: '/mentions-legales' },
        { label: 'Politique de confidentialité', href: '/confidentialite' },
        { label: 'Conditions d’utilisation', href: '/conditions' },
      ],
    },
  ],
};

export const menuItems = [
  { label: 'Fonctionnalités', href: '/#fonctionnalites' },
  { label: 'Comment ça marche', href: '/#etapes' },
  { label: 'Tarifs', href: '/#tarifs' },
  { label: 'FAQ', href: '/#faq' },
];