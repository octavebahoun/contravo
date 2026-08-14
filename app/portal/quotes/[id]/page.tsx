import { headers } from 'next/headers';
import {
  DocumentHeader,
  ItemsTable,
  PortalError,
  TotalsBlock,
  formatDate,
  type LineItem,
} from '../../_components/shared';
import { QuoteActions } from './quote-actions';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * Quote review screen (MVP3 §5).
 *
 * Rendered server-side so the figures reach the recipient even without client
 * JavaScript; only the accept/reject panel is interactive.
 */

type QuoteResponse = {
  quote: {
    id: string;
    number: string;
    status: string;
    currency: string;
    subtotalCents: number;
    discountCents: number;
    taxRateBps: number;
    taxCents: number;
    totalCents: number;
    validUntil: string | null;
    notes: string | null;
    terms: string | null;
    acceptedAt: string | null;
    rejectedAt: string | null;
    items: LineItem[];
  };
  organization: { name: string; brandColor: string } | null;
  recipientEmail: string | null;
  canSign: boolean;
};

async function loadQuote(
  id: string,
  token: string
): Promise<QuoteResponse | { error: string; status: number }> {
  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  const base = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

  const response = await fetch(
    `${base}/api/v1/portal/quotes/${id}?token=${encodeURIComponent(token)}`,
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

export default async function PortalQuotePage({
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

  const result = await loadQuote(id, token);

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

  const { quote, organization, recipientEmail, canSign } = result;
  const decided = Boolean(quote.acceptedAt || quote.rejectedAt);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <DocumentHeader
          eyebrow={organization?.name ?? 'Devis'}
          title="Devis"
          reference={quote.number}
          status={quote.status}
          meta={
            quote.validUntil && !decided ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Valable jusqu&apos;au {formatDate(quote.validUntil)}
              </p>
            ) : null
          }
        />

        <hr className="my-6 border-border" />

        <ItemsTable items={quote.items} currency={quote.currency} />
        <TotalsBlock
          currency={quote.currency}
          subtotalCents={quote.subtotalCents}
          discountCents={quote.discountCents}
          taxRateBps={quote.taxRateBps}
          taxCents={quote.taxCents}
          totalCents={quote.totalCents}
        />

        {quote.notes ? (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-foreground">Notes</h2>
            <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
              {quote.notes}
            </p>
          </div>
        ) : null}

        {quote.terms ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-foreground">Conditions</h2>
            <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
              {quote.terms}
            </p>
          </div>
        ) : null}
      </div>

      {quote.acceptedAt ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <div>
              <h2 className="font-semibold text-foreground">Devis accepté</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Accepté le {formatDate(quote.acceptedAt)}. Votre interlocuteur a été prévenu.
              </p>
            </div>
          </div>
        </div>
      ) : quote.rejectedAt ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="font-semibold text-foreground">Devis refusé</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Refusé le {formatDate(quote.rejectedAt)}.
              </p>
            </div>
          </div>
        </div>
      ) : canSign ? (
        <QuoteActions quoteId={id} token={token} recipientEmail={recipientEmail} />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Ce devis n&apos;attend pas de réponse de votre part pour le moment.
          </p>
        </div>
      )}
    </div>
  );
}
