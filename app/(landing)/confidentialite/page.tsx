import type { Metadata } from 'next';
import { LegalPage, Section, List } from '../_components/legal';
import { publisher, subprocessors } from '../_data/legal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Contravo',
  description:
    'Quelles données Contravo collecte, pourquoi, combien de temps, avec qui elles sont partagées et comment exercer vos droits.',
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Ce que Contravo collecte, pourquoi, combien de temps, et ce que vous pouvez exiger."
    >
      <Section title="Deux rôles à ne pas confondre">
        <p>
          Pour les données de <strong>votre compte</strong> — votre adresse, votre
          organisation, votre abonnement — {publisher.name} est responsable de traitement.
        </p>
        <p>
          Pour les données de <strong>vos clients</strong> que vous saisissez dans l’outil,
          c’est vous le responsable de traitement : vous décidez de ce que vous collectez et
          pourquoi. {publisher.name} n’agit alors que comme sous-traitant, sur vos
          instructions, et n’exploite ces données pour aucune finalité propre.
        </p>
      </Section>

      <Section title="Ce qui est collecté">
        <List
          items={[
            <>
              <strong>Compte</strong> — adresse email, nom, mot de passe. Le mot de passe
              n’est jamais stocké : seule une empreinte irréversible l’est.
            </>,
            <>
              <strong>Organisation</strong> — dénomination, forme juridique, adresse,
              numéros RCCM et contribuable, coordonnées bancaires. Ces informations sont
              imprimées sur vos documents.
            </>,
            <>
              <strong>Documents</strong> — clients, projets, devis, contrats, factures,
              dépenses, livrables, avis, et les fichiers PDF correspondants.
            </>,
            <>
              <strong>Paiements</strong> — montant, référence de transaction, frais, date.
              Aucun numéro de carte ni code Mobile Money ne transite par {publisher.product} :
              la saisie a lieu chez la passerelle de paiement.
            </>,
            <>
              <strong>Signatures</strong> — empreinte SHA-256 du document, horodatage,
              adresse IP du signataire. Ces éléments existent précisément pour rendre la
              signature contestable ou opposable.
            </>,
            <>
              <strong>Journaux</strong> — actions sensibles horodatées, avec l’auteur et
              l’adresse IP, et l’état des notifications envoyées.
            </>,
          ]}
        />
      </Section>

      <Section title="Ce qui n’est pas fait">
        <p>
          Aucune donnée n’est vendue, louée, ni cédée à des tiers à des fins commerciales.
          Aucun profilage publicitaire n’est réalisé. Aucun traceur publicitaire n’est déposé
          sur le site. Les seuls cookies utilisés sont ceux qui maintiennent votre session et
          mémorisent l’organisation active : sans eux, l’application ne fonctionne pas.
        </p>
      </Section>

      <Section title="Qui traite ces données">
        <p>
          Chaque service ci-dessous correspond à un appel réel de l’application, pas à une
          clause de précaution.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-semibold text-foreground">Service</th>
                <th className="py-2 pr-4 font-semibold text-foreground">Rôle</th>
                <th className="py-2 font-semibold text-foreground">Localisation</th>
              </tr>
            </thead>
            <tbody>
              {subprocessors.map((s) => (
                <tr key={s.name} className="border-b border-border align-top">
                  <td className="py-3 pr-4 text-foreground">{s.name}</td>
                  <td className="py-3 pr-4 text-foreground/80">
                    {s.role}
                    <span className="mt-1 block text-xs text-muted-foreground">{s.data}</span>
                  </td>
                  <td className="py-3 text-foreground/80">{s.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Certains de ces services sont établis hors de Côte d’Ivoire. Les transferts
          correspondants s’appuient sur les garanties contractuelles proposées par ces
          prestataires.
        </p>
      </Section>

      <Section title="Combien de temps">
        <List
          items={[
            <>
              <strong>Données de compte</strong> — conservées tant que le compte existe.
            </>,
            <>
              <strong>Documents comptables</strong> — factures et justificatifs de paiement
              sont conservés le temps imposé par les obligations comptables et fiscales
              applicables, même après clôture du compte.
            </>,
            <>
              <strong>Signatures et preuves associées</strong> — conservées aussi longtemps
              que le document signé, puisqu’elles n’ont de sens qu’avec lui.
            </>,
            <>
              <strong>Journaux d’activité</strong> — conservés à des fins de sécurité et de
              traçabilité, puis purgés.
            </>,
            <>
              <strong>Liens de portail client</strong> — seule une empreinte du jeton est
              stockée ; le lien lui-même expire et ne peut pas être rejoué.
            </>,
          ]}
        />
        <p>
          La suppression de votre compte entraîne celle de votre organisation lorsqu’il n’y
          reste aucun autre membre, et des documents qu’elle contient — sous réserve des
          conservations légales ci-dessus.
        </p>
      </Section>

      <Section title="Sécurité">
        <List
          items={[
            'Mots de passe stockés sous forme d’empreinte, jamais en clair.',
            'Clés d’API stockées sous forme d’empreinte : une clé perdue se remplace, elle ne se récupère pas.',
            'Identifiants de passerelle de paiement chiffrés en base.',
            'Cloisonnement des données par organisation à chaque requête.',
            'Notifications sortantes signées, pour que le destinataire puisse vérifier l’origine.',
            'Chiffrement des échanges en transit (HTTPS).',
          ]}
        />
      </Section>

      <Section title="Vos droits">
        <p>
          Vous disposez d’un droit d’accès, de rectification, d’effacement, d’opposition, de
          limitation et de portabilité sur vos données. Ces droits s’exercent auprès de{' '}
          <a href={`mailto:${publisher.email}`} className="text-primary underline underline-offset-4">
            {publisher.email}
          </a>
          . Une réponse est apportée dans un délai d’un mois.
        </p>
        <p>
          Si vous êtes client d’un utilisateur de {publisher.product} et souhaitez exercer
          vos droits sur les données le concernant, adressez-vous à lui : c’est lui qui les a
          collectées et qui en décide.
        </p>
        <p>
          Le traitement relève de la loi ivoirienne n° 2013-450 relative à la protection des
          données à caractère personnel. Vous pouvez saisir l’Autorité de Régulation des
          Télécommunications de Côte d’Ivoire (ARTCI). Si vous résidez dans l’Union
          européenne, le RGPD s’applique et vous pouvez saisir l’autorité de contrôle de
          votre pays.
        </p>
      </Section>

      <Section title="Modifications">
        <p>
          Toute évolution de cette politique est publiée sur cette page, avec une date de
          mise à jour. Un changement substantiel — nouvelle finalité, nouveau sous-traitant
          significatif — est notifié par courriel aux titulaires de compte.
        </p>
      </Section>
    </LegalPage>
  );
}
