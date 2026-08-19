/**
 * Identité de l'éditeur et sous-traitants, pour les trois pages légales.
 *
 * Rassemblé ici parce que les mêmes informations apparaissent sur les trois
 * pages : une identité modifiée à un seul endroit ne peut pas se contredire
 * d'une page à l'autre.
 *
 * Les valeurs `À COMPLÉTER` s'affichent telles quelles sur le site. C'est
 * délibéré : une mention légale incomplète doit se voir, pas se deviner.
 */
const TODO = '[À COMPLÉTER]';

export const publisher = {
  product: 'Contravo',
  company: 'Excellence Team',
  /** SARL, SAS, entreprise individuelle… */
  legalForm: TODO,
  capital: TODO,
  /** Registre du Commerce et du Crédit Mobilier. */
  rccm: TODO,
  /** Numéro de Compte Contribuable. */
  ncc: TODO,
  address: TODO,
  phone: '+225 01 50 65 45 75 · +225 01 47 79 70 82',
  email: 'contact@excellenceteam.site',
  /** Personne physique responsable du contenu publié. */
  publicationDirector: 'Octave Précieux BAHOUN-HOUTOUKPE',
  site: 'https://contravo-7g6p.vercel.app',
};

export const host = {
  name: 'Vercel Inc.',
  address: '340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis',
  site: 'https://vercel.com',
};

/**
 * Les tiers qui traitent des données pour le compte de Contravo.
 *
 * La liste est celle de l'architecture réelle : chaque entrée correspond à un
 * service effectivement appelé par l'application, pas à une clause de style.
 */
export const subprocessors = [
  {
    name: 'Vercel',
    role: 'Hébergement de l’application et exécution du code',
    data: 'Toutes les données transitent par les serveurs d’exécution',
    location: 'États-Unis / Union européenne',
  },
  {
    name: 'Neon',
    role: 'Base de données PostgreSQL',
    data: 'Comptes, organisations, clients, documents, paiements, journaux',
    location: 'Union européenne',
  },
  {
    name: 'Cloudflare R2',
    role: 'Stockage des fichiers',
    data: 'PDF de devis, contrats et factures, pièces jointes, logos',
    location: 'Réseau mondial',
  },
  {
    name: 'Resend',
    role: 'Acheminement des emails transactionnels',
    data: 'Adresse du destinataire, contenu du message, pièces jointes',
    location: 'États-Unis',
  },
  {
    name: 'GeniusPay',
    role: 'Encaissement des paiements',
    data: 'Montant, référence, coordonnées du payeur saisies chez eux',
    location: 'Côte d’Ivoire',
  },
  {
    name: 'n8n',
    role: 'Orchestration des notifications (instance auto-hébergée)',
    data: 'Contenu des évènements émis par l’application',
    location: 'Serveur de l’éditeur',
  },
];

/** Date de dernière révision, affichée en tête de chaque page. */
export const lastUpdated = '19 août 2026';
