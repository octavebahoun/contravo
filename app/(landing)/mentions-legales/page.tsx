import type { Metadata } from 'next';
import { LegalPage, Section, Row } from '../_components/legal';
import { publisher, host } from '../_data/legal';

export const metadata: Metadata = {
  title: 'Mentions légales — Contravo',
  description:
    'Identité de l’éditeur de Contravo, hébergeur du site, propriété intellectuelle et responsabilité.',
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      intro="Qui édite Contravo, qui l’héberge, et à qui s’adresser."
    >
      <Section title="Éditeur">
        <div>
          <Row label="Service" value={publisher.product} />
          <Row label="Éditeur" value={publisher.company} />
          <Row label="Forme juridique" value={publisher.legalForm} />
          <Row label="Capital social" value={publisher.capital} />
          <Row label="RCCM" value={publisher.rccm} />
          <Row label="IFU (Identifiant Fiscal Unique)" value={publisher.ifu} />
          <Row label="Siège social" value={publisher.address} />
          <Row label="Téléphone" value={publisher.phone} />
          <Row label="Courriel" value={publisher.email} />
          <Row label="Directeur de la publication" value={publisher.publicationDirector} />
        </div>
      </Section>

      <Section title="Hébergement">
        <p>
          Le site et l’application sont hébergés par {host.name}, {host.address} — {host.site}.
        </p>
        <p>
          Les données de l’application sont stockées en base PostgreSQL chez Neon et les
          fichiers chez Cloudflare R2. Le détail des sous-traitants et de leur localisation
          figure dans la{' '}
          <a href="/confidentialite" className="text-primary underline underline-offset-4">
            politique de confidentialité
          </a>
          .
        </p>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          Le nom {publisher.product}, son identité visuelle, la structure du site et le code
          de l’application sont la propriété de {publisher.company}. Toute reproduction ou
          adaptation, totale ou partielle, sans autorisation écrite préalable est interdite.
        </p>
        <p>
          Les documents que vous créez avec {publisher.product} — devis, contrats, factures,
          fichiers déposés — vous appartiennent. L’éditeur ne revendique aucun droit sur leur
          contenu et ne les exploite à aucune autre fin que la fourniture du service.
        </p>
      </Section>

      <Section title="Responsabilité">
        <p>
          {publisher.product} est un outil de gestion documentaire et de facturation. Il
          n’assure ni conseil juridique, ni conseil fiscal, ni conseil comptable. La validité
          d’un document émis, l’exactitude des montants et le respect des obligations
          déclaratives relèvent de l’utilisateur qui l’émet.
        </p>
        <p>
          L’éditeur met en œuvre les moyens raisonnables pour assurer la disponibilité et
          l’exactitude du service, sans garantie d’absence d’interruption ou d’erreur. Les
          conditions et limites précises figurent dans les{' '}
          <a href="/conditions" className="text-primary underline underline-offset-4">
            conditions d’utilisation
          </a>
          .
        </p>
      </Section>

      <Section title="Signature électronique">
        <p>
          Les signatures recueillies via {publisher.product} sont scellées par une empreinte
          cryptographique SHA-256 du document signé, un horodatage et l’adresse IP du
          signataire. Ces éléments permettent d’établir que le document n’a pas été modifié
          après signature et restent vérifiables après coup.
        </p>
        <p>
          Le régime applicable est celui de la loi ivoirienne n° 2013-546 relative aux
          transactions électroniques. La valeur probante d’une signature dépend du contexte
          de son recueil et relève, en cas de litige, de l’appréciation du juge.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Toute question ou réclamation relative au site ou au service peut être adressée à{' '}
          <a href={`mailto:${publisher.email}`} className="text-primary underline underline-offset-4">
            {publisher.email}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
