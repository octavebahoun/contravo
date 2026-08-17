/**
 * Catalogue of the events an organization can subscribe a webhook endpoint to.
 *
 * Kept as one list because it had no home: the developer screen offered a
 * hardcoded choice of two (`invoice.paid`, `quote.accepted`) out of the forty-six
 * the application actually emits, and nothing validated the `events` array on the
 * way in — so an endpoint could be saved subscribed to a typo and would simply
 * never fire.
 *
 * Names here must match the first argument of `emit()` at the call sites exactly.
 */

export type WebhookEventGroup = {
  /** Entity the events belong to, used as a section heading. */
  label: string;
  events: { name: string; label: string }[];
};

export const WEBHOOK_EVENT_GROUPS: WebhookEventGroup[] = [
  {
    label: 'Clients',
    events: [
      { name: 'client.created', label: 'Client créé' },
      { name: 'client.updated', label: 'Client modifié' },
      { name: 'client.archived', label: 'Client archivé' },
      { name: 'client.unarchived', label: 'Client réactivé' },
      { name: 'client.deleted', label: 'Client supprimé' },
    ],
  },
  {
    label: 'Projets',
    events: [
      { name: 'project.created', label: 'Projet créé' },
      { name: 'project.updated', label: 'Projet modifié' },
      { name: 'project.status_changed', label: 'Statut de projet changé' },
      { name: 'project.delivered', label: 'Projet livré' },
    ],
  },
  {
    label: 'Devis',
    events: [
      { name: 'quote.created', label: 'Devis créé' },
      { name: 'quote.updated', label: 'Devis modifié' },
      { name: 'quote.sent', label: 'Devis envoyé' },
      { name: 'quote.viewed', label: 'Devis consulté' },
      { name: 'quote.accepted', label: 'Devis accepté' },
      { name: 'quote.rejected', label: 'Devis refusé' },
      { name: 'quote.deleted', label: 'Devis supprimé' },
    ],
  },
  {
    label: 'Contrats',
    events: [
      { name: 'contract.created', label: 'Contrat créé' },
      { name: 'contract.updated', label: 'Contrat modifié' },
      { name: 'contract.sent', label: 'Contrat envoyé' },
      { name: 'contract.signed', label: 'Contrat signé' },
      { name: 'contract.deleted', label: 'Contrat supprimé' },
    ],
  },
  {
    label: 'Factures',
    events: [
      { name: 'invoice.created', label: 'Facture créée' },
      { name: 'invoice.updated', label: 'Facture modifiée' },
      { name: 'invoice.sent', label: 'Facture envoyée' },
      { name: 'invoice.paid', label: 'Facture payée' },
      { name: 'invoice.overdue', label: 'Facture en retard' },
      { name: 'invoice.refunded', label: 'Facture remboursée' },
      { name: 'invoice.payment_failed', label: 'Paiement échoué' },
      { name: 'invoice.deleted', label: 'Facture supprimée' },
    ],
  },
  {
    label: 'Livrables',
    events: [
      { name: 'deliverable.created', label: 'Livrable créé' },
      { name: 'deliverable.updated', label: 'Livrable modifié' },
      { name: 'deliverable.submitted', label: 'Livrable soumis' },
      { name: 'deliverable.resubmitted', label: 'Livrable resoumis' },
      { name: 'deliverable.approved', label: 'Livrable approuvé' },
      { name: 'deliverable.rejected', label: 'Livrable refusé' },
      { name: 'deliverable.revision_requested', label: 'Révision demandée' },
      { name: 'deliverable.deleted', label: 'Livrable supprimé' },
    ],
  },
  {
    label: 'Dépenses',
    events: [
      { name: 'expense.created', label: 'Dépense créée' },
      { name: 'expense.updated', label: 'Dépense modifiée' },
      { name: 'expense.deleted', label: 'Dépense supprimée' },
    ],
  },
  {
    label: 'Avis',
    events: [
      { name: 'review.requested', label: 'Avis demandé' },
      { name: 'review.created', label: 'Avis déposé' },
      { name: 'review.moderated', label: 'Avis modéré' },
    ],
  },
  {
    label: 'Compte',
    events: [
      { name: 'invitation.sent', label: 'Invitation envoyée' },
      { name: 'user.password_reset_requested', label: 'Réinitialisation de mot de passe demandée' },
      { name: 'subscription.activated', label: 'Abonnement activé' },
      { name: 'subscription.cancelled', label: 'Abonnement résilié' },
      { name: 'subscription.resumed', label: 'Abonnement repris' },
    ],
  },
];

/** Wildcard accepted in an endpoint's `events` array: every event. */
export const WEBHOOK_EVENT_WILDCARD = '*';

/** Flat set of every valid event name, used for validation. */
export const WEBHOOK_EVENT_NAMES: string[] = WEBHOOK_EVENT_GROUPS.flatMap((group) =>
  group.events.map((event) => event.name)
);

const KNOWN = new Set(WEBHOOK_EVENT_NAMES);

/** Whether `event` is a name an endpoint may subscribe to (wildcard included). */
export function isKnownWebhookEvent(event: string): boolean {
  return event === WEBHOOK_EVENT_WILDCARD || KNOWN.has(event);
}

/** The `event.name → label` map, for displaying a stored subscription. */
export const WEBHOOK_EVENT_LABELS: Record<string, string> = Object.fromEntries(
  WEBHOOK_EVENT_GROUPS.flatMap((group) => group.events.map((event) => [event.name, event.label]))
);

/** Test event emitted by the endpoint's "send a test" action. */
export const WEBHOOK_TEST_EVENT = 'webhook.test';
