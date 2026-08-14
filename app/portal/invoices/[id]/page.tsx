import { headers } from 'next/headers';
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

/**
 * Invoice screen for the client portal (MVP3 §5).
 *
 * Shows the outstanding balance and how to settle it. Card / mobile-money
 * payment goes through GeniusPay, whose portal payment-intent route is not
 * wired yet, so the bank details are the actionable path for now.
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
  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  const base = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

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
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

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

  const { invoice, organization, canPay } = result;
  const bankEntries = Object.entries(organization?.bankDetails ?? {}).filter(
    ([, value]) => typeof value === 'string' && value.trim().length > 0
  );

  return (
    <div className="space-y-6">
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
      ) : canPay && bankEntries.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Régler cette facture</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Montant dû :{' '}
            <span className="font-semibold text-foreground">
              {formatAmount(invoice.amountDueCents, invoice.currency)}
            </span>
          </p>

          <dl className="mt-5 space-y-2">
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
        </div>
      ) : canPay ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Montant dû :{' '}
            <span className="font-semibold text-foreground">
              {formatAmount(invoice.amountDueCents, invoice.currency)}
            </span>
            . Contactez votre interlocuteur pour les modalités de règlement.
          </p>
        </div>
      ) : null}
    </div>
  );
}
