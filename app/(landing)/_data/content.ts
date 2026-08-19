/**
 * Landing page copy (direction « Le cachet » — v1.0).
 *
 * Everything shown publicly lives here so wording can change without touching
 * layout. Chiffres de la bande « Preuve » : à valider avec le fondateur avant
 * mise en production.
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
 * Chiffres à valider avec le fondateur avant mise en production.
 */
export const proofStats: Array<{ value: string; label: string }> = [
  { value: '3', label: 'documents créés par jour' },
  { value: '4×', label: 'plus vite encaissé' },
  { value: '100 %', label: 'de signatures en ligne' },
];

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
      title: 'Paiement direct',
      description:
        'Mobile money (Orange, MTN, Moov…) et carte via GeniusPay, en XOF. Le suivi est automatique.',
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

export const faqs = [
  {
    question: 'Le client doit-il créer un compte ?',
    answer:
      'Non. Il reçoit un lien personnel, signe en 30 secondes depuis son téléphone, sans compte ni mot de passe.',
  },
  {
    question: 'Quels moyens de paiement ?',
    answer:
      'Mobile money (Orange Money, MTN MoMo, Moov…) et carte bancaire, via GeniusPay, en XOF. Chaque paiement reçu clôture automatiquement la facture.',
  },
  {
    question: 'Mes documents sont-ils protégés ?',
    answer:
      'Oui. Chaque signature est horodatée, scellée par une empreinte SHA-256 vérifiable, et les copies sont conservées. Chaque organisation est isolée au niveau de la base de données.',
  },
];

export const ctaDetails = {
  heading: 'Prêt à vendre plus vite ?',
  subheading:
    'Créez votre premier devis gratuitement, envoyez-le, et regardez votre client signer.',
  primaryCta: { label: 'Créer mon premier devis gratuit', href: '/sign-up' },
};

export const footerDetails = {
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
  { label: 'FAQ', href: '/#faq' },
];