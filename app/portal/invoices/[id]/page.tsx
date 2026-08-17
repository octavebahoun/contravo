import { getSelfOrigin } from '@/lib/config/self-origin';
import {
  DocumentHeader,
  ItemsTable,
  PortalError,
  TotalsBlock,
  formatAmount,
  formatDate,
  type LineItem,
} from '../../_components/shared';
import { CheckCircle2 } from 'lucide-react';
import { PayButton } from './pay-button';

/**
 * Invoice screen for the client portal (MVP3 §5).
 *
 * Shows the outstanding balance and how to settle it: online checkout through
 * GeniusPay when the organization has connected a gateway, and the bank details
 * either as the alternative or as the only path.
 *
 * Returning from the gateway lands back here with `?status=success|failed`. That
 * only reflects what the checkout page said — the invoice itself is settled by
 * the webhook, which re-fetches the transaction from GeniusPay first, so the
 * banner is careful not to claim the payment is recorded.
 */

type InvoiceResponse = {
  invoice: {
    id: string;
    number: string;
    status: string;
    currency: string;
    subtotalCents: number;
    discountCents: number;
    taxRateBps: number;
    taxCents: number;
    totalCents: number;
    amountPaidCents: number;
    amountDueCents: number;
    issueDate: string | null;
    dueDate: string | null;
    paidAt: string | null;
    notes: string | null;
    items: LineItem[];
  };
  organization: {
    name: string;
    brandColor: string;
    bankDetails: Record<string, string> | null;
  } | null;
  canPay: boolean;
  onlinePayment: boolean;
};

const BANK_LABELS: Record<string, string> = {
  iban: 'IBAN',
  bic: 'BIC',
  bankName: 'Banque',
  accountName: 'Titulaire',
  mobileMoney: 'Mobile Money',
};

async function loadInvoice(
  id: string,
  token: string
): Promise<InvoiceResponse | { error: string; status: number }> {
  // The server's own origin, not NEXT_PUBLIC_APP_URL: that variable holds the
  // public address used in client-facing links, so a local server was fetching
  // production's API during its render.
  const base = await getSelfOrigin();

  const response = await fetch(
    `${base}/api/v1/portal/invoices/${id}?token=${encodeURIComponent(token)}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      error: body?.error?.message || body?.message || 'Document indisponible',
    };
  }

  return response.json();
}

export default async function PortalInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { id } = await params;
  const { token, status: paymentStatus } = await searchParams;

  if (!token) {
    return (
      <PortalError
        title="Lien incomplet"
        message="Ce lien ne contient pas de jeton d'accès. Utilisez le lien exact reçu par email."
      />
    );
  }

  const result = await loadInvoice(id, token);

  if ('error' in result) {
    return (
      <PortalError
        title={result.status === 404 ? 'Document introuvable' : 'Accès refusé'}
        message={
          result.status === 403
            ? "Ce lien a expiré ou n'est plus valide. Demandez-en un nouveau à votre interlocuteur."
            : result.error
        }
      />
    );
  }

  const { invoice, organization, canPay, onlinePayment } = result;
  const bankEntries = Object.entries(organization?.bankDetails ?? {}).filter(
    ([, value]) => typeof value === 'string' && value.trim().length > 0
  );

  return (
    <div className="space-y-6">
      {paymentStatus === 'success' && !invoice.paidAt ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-5">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Paiement transmis.</span> Sa confirmation par notre
            prestataire peut prendre quelques instants — cette page se mettra à jour dès qu’il
            l’aura validé.
          </p>
        </div>
      ) : null}

      {paymentStatus === 'failed' ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Le paiement n’a pas abouti.</span> Aucun montant n’a été
            débité. Vous pouvez réessayer ci-dessous.
          </p>
        </div>
      ) : null}
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <DocumentHeader
          eyebrow={organization?.name ?? 'Facture'}
          title="Facture"
          reference={invoice.number}
          status={invoice.status}
          meta={
            <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
              {invoice.issueDate ? <p>Émise le {formatDate(invoice.issueDate)}</p> : null}
              {invoice.dueDate && !invoice.paidAt ? (
                <p>Échéance : {formatDate(invoice.dueDate)}</p>
              ) : null}
            </div>
          }
        />

        <hr className="my-6 border-border" />

        <ItemsTable items={invoice.items} currency={invoice.currency} />
        <TotalsBlock
          currency={invoice.currency}
          subtotalCents={invoice.subtotalCents}
          discountCents={invoice.discountCents}
          taxRateBps={invoice.taxRateBps}
          taxCents={invoice.taxCents}
          totalCents={invoice.totalCents}
          dueCents={invoice.amountDueCents}
        />

        {invoice.notes ? (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-foreground">Notes</h2>
            <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
              {invoice.notes}
            </p>
          </div>
        ) : null}
      </div>

      {invoice.paidAt ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <div>
              <h2 className="font-semibold text-foreground">Facture réglée</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Paiement reçu le {formatDate(invoice.paidAt)}. Merci !
              </p>
            </div>
          </div>
        </div>
      ) : canPay ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Régler cette facture</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Montant dû :{' '}
            <span className="font-semibold text-foreground">
              {formatAmount(invoice.amountDueCents, invoice.currency)}
            </span>
          </p>

          {onlinePayment ? (
            <div className="mt-5">
              <PayButton
                invoiceId={invoice.id}
                token={token}
                amountLabel={formatAmount(invoice.amountDueCents, invoice.currency)}
              />
            </div>
          ) : null}

          {bankEntries.length > 0 ? (
            <>
              {onlinePayment ? (
                <p className="mt-6 text-sm font-medium text-foreground">Ou par virement</p>
              ) : null}

              <dl className="mt-3 space-y-2">
                {bankEntries.map(([key, value]) => (
                  <div key={key} className="flex flex-wrap justify-between gap-2 text-sm">
                    <dt className="text-muted-foreground">{BANK_LABELS[key] ?? key}</dt>
                    <dd className="font-mono text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 text-xs text-muted-foreground">
                Indiquez la référence {invoice.number} lors de votre virement.
              </p>
            </>
          ) : !onlinePayment ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Contactez votre interlocuteur pour les modalités de règlement.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
