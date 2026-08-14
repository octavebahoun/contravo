import type { ReactNode } from 'react';

/**
 * Landing page copy, kept apart from the components (structure adapted from the
 * Finwise template, MIT).
 *
 * Everything shown publicly lives here so wording can change without touching
 * layout. Sections that would need real customers or shipped features are
 * marked `placeholder` and rendered as such — never as invented proof.
 */

export const siteDetails = {
  name: 'Contravo',
  tagline: 'Gérez. Signez. Encaissez.',
  description:
    'Devis, contrats, signature électronique et factures : tout votre business au même endroit.',
};

export const heroDetails = {
  heading: 'Gérez. Signez. Encaissez.',
  subheading:
    'Contravo réunit devis, contrats, signature électronique et facturation dans un seul outil pensé pour les prestataires et agences.',
  primaryCta: { label: 'Créer un compte', href: '/sign-up' },
  secondaryCta: { label: 'Se connecter', href: '/sign-in' },
};

export type Benefit = {
  title: string;
  description: string;
  /** Lucide icon name resolved by the component. */
  icon: 'FileText' | 'PenLine' | 'Receipt' | 'Workflow' | 'ShieldCheck' | 'Wallet';
  bullets: string[];
};

export const benefits: Benefit[] = [
  {
    title: 'Devis qui se transforment en contrats',
    description:
      "Composez un devis, envoyez-le, et suivez son parcours jusqu'à l'acceptation. Le contrat se crée automatiquement.",
    icon: 'FileText',
    bullets: [
      'Lignes, remises et TVA calculées pour vous',
      'Numérotation continue et conforme',
      'PDF généré à chaque envoi',
    ],
  },
  {
    title: 'Signature électronique intégrée',
    description:
      'Votre client signe depuis son navigateur, sans compte ni logiciel. Chaque signature est horodatée et scellée.',
    icon: 'PenLine',
    bullets: [
      'Signature manuscrite au doigt ou à la souris',
      'Certificat de signature joint au document',
      'Empreinte SHA-256 vérifiable par un tiers',
    ],
  },
  {
    title: 'Factures et encaissement',
    description:
      'Facturez en un clic depuis un contrat signé, puis encaissez par mobile money ou carte via GeniusPay.',
    icon: 'Receipt',
    bullets: [
      'Relances automatiques des impayés',
      'Suivi des règlements partiels',
      'Rapprochement automatique des paiements',
    ],
  },
  {
    title: 'Portail client sans friction',
    description:
      "Un lien par email suffit : votre client consulte, valide et paie sans créer de compte.",
    icon: 'Workflow',
    bullets: [
      'Liens personnels à durée limitée',
      'Validation des livrables en ligne',
      'Collecte des avis en fin de projet',
    ],
  },
  {
    title: 'Vos données isolées',
    description:
      'Chaque organisation est cloisonnée au niveau de la base. Les accès sont tracés et révocables.',
    icon: 'ShieldCheck',
    bullets: [
      'Isolation stricte par organisation',
      'Journal d’audit de chaque action',
      'Clés API à portée limitée',
    ],
  },
  {
    title: 'Rentabilité par projet',
    description:
      'Suivez dépenses et marges projet par projet, pour savoir ce qui vous rapporte vraiment.',
    icon: 'Wallet',
    bullets: [
      'Dépenses avec justificatifs',
      'Marge calculée en temps réel',
      'Vue consolidée par client',
    ],
  },
];

export type Step = { number: string; title: string; description: string };

export const steps: Step[] = [
  {
    number: '01',
    title: 'Créez votre devis',
    description:
      'Ajoutez vos lignes, vos conditions et vos coordonnées. Contravo calcule les totaux et génère le PDF.',
  },
  {
    number: '02',
    title: 'Votre client signe',
    description:
      "Il reçoit un lien, consulte le document et signe en ligne. Vous êtes notifié à chaque étape.",
  },
  {
    number: '03',
    title: 'Vous encaissez',
    description:
      'La facture part automatiquement, le paiement est suivi, et les relances se déclenchent seules.',
  },
];

/**
 * Plans from MVP6 §3. Billing is not implemented yet, so every button leads to
 * signup rather than a checkout that does not exist.
 */
export const pricing = {
  placeholder: true,
  note: "Tarifs indicatifs — la facturation des abonnements arrive prochainement.",
  plans: [
    {
      name: 'Free',
      price: '0',
      currency: 'XOF',
      period: '/mois',
      description: 'Pour démarrer et tester la plateforme.',
      features: [
        '1 membre',
        '3 projets actifs',
        '10 documents par mois',
        'Portail client inclus',
      ],
      cta: 'Commencer gratuitement',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '15 000',
      currency: 'XOF',
      period: '/mois',
      description: 'Pour les indépendants et petites équipes.',
      features: [
        '5 membres',
        'Projets illimités',
        'Documents illimités',
        'Relances automatiques',
        'Clés API',
      ],
      cta: 'Choisir Pro',
      highlighted: true,
    },
    {
      name: 'Business',
      price: '45 000',
      currency: 'XOF',
      period: '/mois',
      description: 'Pour les agences et structures établies.',
      features: [
        'Membres illimités',
        'Webhooks et intégrations',
        'Stockage étendu',
        'Support prioritaire',
      ],
      cta: 'Choisir Business',
      highlighted: false,
    },
  ],
};

/**
 * Customer quotes. Empty on purpose: Contravo has no public references yet, and
 * inventing them would misrepresent the product.
 */
export const testimonials: Array<{
  name: string;
  role: string;
  quote: string;
}> = [];

/**
 * Usage figures, also empty until there is something real to count.
 */
export const stats: Array<{ value: string; label: string }> = [];

export const faqs = [
  {
    question: 'La signature électronique a-t-elle une valeur légale ?',
    answer:
      "Contravo produit une signature électronique simple au sens du règlement eIDAS. Chaque signature est horodatée, associée à l'adresse IP du signataire et scellée par une empreinte SHA-256 vérifiable publiquement. C'est suffisant pour la majorité des contrats commerciaux ; pour une signature qualifiée, un tiers certificateur reste nécessaire.",
  },
  {
    question: 'Mon client doit-il créer un compte pour signer ?',
    answer:
      "Non. Il reçoit un lien personnel par email qui lui donne accès au seul document concerné, pour une durée limitée. Aucun compte, aucun mot de passe.",
  },
  {
    question: 'Comment sont encaissés les paiements ?',
    answer:
      'Les factures sont réglées via GeniusPay, qui prend en charge le mobile money et la carte bancaire. Les règlements sont rapprochés automatiquement de la facture concernée.',
  },
  {
    question: 'Mes données sont-elles isolées des autres organisations ?',
    answer:
      "Oui. Chaque requête est filtrée par organisation au niveau de la base de données, et non seulement dans l'application. Chaque action est enregistrée dans un journal d'audit.",
  },
  {
    question: 'Puis-je connecter Contravo à mes autres outils ?',
    answer:
      "Oui, via des clés API à portée limitée et des webhooks déclenchés à chaque événement métier : devis envoyé, contrat signé, facture payée, etc.",
  },
];

export const ctaDetails = {
  heading: 'Prêt à simplifier votre administratif ?',
  subheading:
    'Créez votre compte et envoyez votre premier devis en quelques minutes.',
  primaryCta: { label: 'Créer un compte', href: '/sign-up' },
};

export const footerDetails = {
  columns: [
    {
      title: 'Produit',
      links: [
        { label: 'Fonctionnalités', href: '#fonctionnalites' },
        { label: 'Tarifs', href: '#tarifs' },
        { label: 'FAQ', href: '#faq' },
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
  ],
};

export const menuItems = [
  { label: 'Fonctionnalités', href: '#fonctionnalites' },
  { label: 'Comment ça marche', href: '#etapes' },
  { label: 'Tarifs', href: '#tarifs' },
  { label: 'FAQ', href: '#faq' },
];