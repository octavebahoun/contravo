import type { Metadata } from 'next';
import { LegalPage, Section, List } from '../_components/legal';
import { publisher } from '../_data/legal';
import { PLANS } from '@/lib/billing/plans';
import { formatSaasPrice } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation — Contravo',
  description:
    'Objet du service, compte et responsabilités, abonnements et facturation, résiliation, limites de garantie.',
};

export default function ConditionsPage() {
  return (
    <LegalPage
      title="Conditions d’utilisation"
      intro={`Le contrat entre vous et ${publisher.name} pour l’usage de ${publisher.product}. Créer un compte vaut acceptation.`}
    >
      <Section title="1. Objet">
        <p>
          {publisher.product} permet d’établir des devis, des contrats et des factures, de
          les faire signer en ligne, d’en suivre le paiement et de relancer les impayés. Le
          service est fourni en l’état, accessible par navigateur et par interface de
          programmation.
        </p>
        <p>
          {publisher.product} n’est ni un cabinet comptable, ni un cabinet d’avocats, ni un
          établissement de paiement. Les encaissements sont opérés par une passerelle tierce,
          sous sa propre responsabilité et ses propres conditions.
        </p>
      </Section>

      <Section title="2. Compte">
        <p>
          La création d’un compte suppose d’être majeur et d’agir dans un cadre
          professionnel. Vous répondez de l’exactitude des informations déclarées et de la
          confidentialité de vos identifiants, clés d’API comprises.
        </p>
        <p>
          Le premier compte d’une organisation en est propriétaire. Il peut inviter des
          membres, leur attribuer un rôle, et les révoquer. Les actions d’un membre engagent
          l’organisation.
        </p>
      </Section>

      <Section title="3. Ce que vous vous engagez à ne pas faire">
        <List
          items={[
            'Émettre des documents frauduleux, ou usurper l’identité d’un tiers.',
            'Déposer des contenus illicites, ou dont vous n’avez pas les droits.',
            'Contourner les quotas de votre formule, ou éprouver la sécurité du service sans autorisation écrite.',
            'Automatiser l’envoi de messages non sollicités depuis le service.',
            'Revendre l’accès au service sans accord écrit préalable.',
          ]}
        />
      </Section>

      <Section title="4. Vos données et vos documents">
        <p>
          Les documents et fichiers que vous créez vous appartiennent. {publisher.name}{' '}
          n’y accède que dans la mesure nécessaire à l’exploitation du service — assistance
          à votre demande, diagnostic d’incident — et ne les exploite à aucune autre fin.
        </p>
        <p>
          Vous pouvez exporter vos documents à tout moment depuis l’application et son
          interface de programmation. Le traitement des données personnelles est décrit dans
          la{' '}
          <a href="/confidentialite" className="text-primary underline underline-offset-4">
            politique de confidentialité
          </a>
          .
        </p>
      </Section>

      <Section title="5. Formules et facturation">
        <p>
          Trois formules sont proposées, facturées mensuellement en francs CFA, d’avance :
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-semibold text-foreground">Formule</th>
                <th className="py-2 pr-4 font-semibold text-foreground">Prix mensuel</th>
                <th className="py-2 font-semibold text-foreground">Membres · Clients · Projets</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(PLANS).map((plan) => (
                <tr key={plan.id} className="border-b border-border">
                  <td className="py-3 pr-4 text-foreground">{plan.name}</td>
                  <td className="py-3 pr-4 text-foreground/80">
                    {formatSaasPrice(plan.priceMonthlyCents, plan.currency)}
                  </td>
                  <td className="py-3 text-foreground/80">
                    {[plan.quotas.maxMembers, plan.quotas.maxClients, plan.quotas.maxProjects]
                      .map((q) => (q === null ? 'illimité' : String(q)))
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Le détail complet des quotas — stockage, clés d’API, appels mensuels — figure sur
          l’écran Facturation de votre compte, qui fait foi.
        </p>
        <p>
          Atteindre un quota bloque la création de nouveaux éléments ; il ne supprime jamais
          ce qui existe déjà.
        </p>
      </Section>

      <Section title="6. Changement de formule et résiliation">
        <p>
          Une montée en formule prend effet dès le paiement. Une rétrogradation vers la
          formule gratuite est programmée à la fin de la période en cours : vous conservez ce
          que vous avez payé jusqu’à son terme. Aucun remboursement ni prorata n’est pratiqué
          sur un mois entamé.
        </p>
        <p>
          Vous pouvez résilier à tout moment, sans préavis ni justification. La suppression
          du compte entraîne celle de l’organisation lorsqu’il n’y reste aucun autre membre.
        </p>
        <p>
          {publisher.name} peut suspendre un compte en cas de défaut de paiement, ou de
          manquement caractérisé aux engagements de l’article 3. Sauf urgence ou obligation
          légale, la suspension est précédée d’un avertissement laissant un délai
          raisonnable pour régulariser.
        </p>
      </Section>

      <Section title="7. Disponibilité">
        <p>
          {publisher.name} met en œuvre les moyens raisonnables pour maintenir le service
          accessible, sans engagement de niveau de service. Des interruptions peuvent
          survenir pour maintenance, ou du fait d’un prestataire tiers — hébergeur, service
          d’envoi d’emails, passerelle de paiement.
        </p>
      </Section>

      <Section title="8. Limites de responsabilité">
        <p>
          Vous restez seul responsable du contenu de vos documents, de l’exactitude des
          montants, du respect de vos obligations fiscales et comptables, et des relations
          avec vos propres clients.
        </p>
        <p>
          La responsabilité d’{publisher.name} ne peut être engagée pour un préjudice
          indirect — perte d’exploitation, perte de chance, atteinte à l’image. En tout état
          de cause, elle est plafonnée aux sommes effectivement versées au titre de
          l’abonnement au cours des douze mois précédant le fait générateur.
        </p>
        <p>
          Ces limites ne s’appliquent ni en cas de faute lourde ou dolosive, ni dans les cas
          où la loi les interdit.
        </p>
      </Section>

      <Section title="9. Évolution des conditions">
        <p>
          Ces conditions peuvent évoluer. Toute modification substantielle est notifiée par
          courriel au moins trente jours avant son entrée en vigueur. Poursuivre l’usage du
          service après cette date vaut acceptation ; à défaut, vous pouvez résilier sans
          frais.
        </p>
      </Section>

      <Section title="10. Droit applicable">
        <p>
          Les présentes conditions sont régies par le droit ivoirien. En cas de différend,
          les parties recherchent d’abord une solution amiable en écrivant à{' '}
          <a href={`mailto:${publisher.email}`} className="text-primary underline underline-offset-4">
            {publisher.email}
          </a>
          . À défaut d’accord, le litige relève des tribunaux compétents d’Abidjan.
        </p>
      </Section>
    </LegalPage>
  );
}
