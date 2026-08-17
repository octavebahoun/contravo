import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { formatMoney } from '@/lib/money';

/**
 * Presentation helpers shared by the portal screens.
 *
 * Amounts and dates are formatted here rather than with `Intl`, so a document
 * reads identically whatever locale the recipient's browser reports.
 */

/**
 * Formats a stored minor-unit amount.
 *
 * Delegates to the shared formatter. This used to divide by 100 for every
 * currency, so **the client saw "250,00 XOF" on a 25 000 XOF invoice** — a
 * different figure from the one the dashboard showed the issuer.
 */
export const formatAmount = formatMoney;

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function formatQuantity(quantity: string): string {
  const trimmed = String(quantity).trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  const normalized = trimmed.includes('.')
    ? trimmed.replace(/0+$/, '').replace(/\.$/, '')
    : trimmed;
  return normalized.replace('.', ',');
}

/** Business statuses mapped to the charte's feedback colours — never decorative. */
const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-muted text-muted-foreground' },
  sent: { label: 'En attente', className: 'bg-info/10 text-info' },
  viewed: { label: 'Consulté', className: 'bg-info/10 text-info' },
  accepted: { label: 'Accepté', className: 'bg-success/10 text-success' },
  signed: { label: 'Signé', className: 'bg-success/10 text-success' },
  approved: { label: 'Approuvé', className: 'bg-success/10 text-success' },
  paid: { label: 'Payée', className: 'bg-success/10 text-success' },
  partial: { label: 'Partiellement payée', className: 'bg-warning/10 text-warning' },
  submitted: { label: 'À valider', className: 'bg-warning/10 text-warning' },
  overdue: { label: 'En retard', className: 'bg-destructive/10 text-destructive' },
  rejected: { label: 'Refusé', className: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Annulé', className: 'bg-muted text-muted-foreground' },
  expired: { label: 'Expiré', className: 'bg-muted text-muted-foreground' },
  revision_requested: { label: 'Révision demandée', className: 'bg-warning/10 text-warning' },
  refunded: { label: 'Remboursée', className: 'bg-muted text-muted-foreground' },
  pending: { label: 'En attente', className: 'bg-info/10 text-info' },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? {
    label: status,
    className: 'bg-muted text-muted-foreground',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

/** Full-page message for an expired link, a wrong token or a missing document. */
export function PortalError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** Document header: issuer, reference and current status. */
export function DocumentHeader({
  eyebrow,
  title,
  reference,
  status,
  meta,
}: {
  eyebrow: string;
  title: string;
  reference?: string | null;
  status?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{title}</h1>
        {reference ? (
          <p className="mt-1 font-mono text-sm text-muted-foreground">{reference}</p>
        ) : null}
        {meta}
      </div>
      {status ? <StatusBadge status={status} /> : null}
    </div>
  );
}

export type LineItem = {
  position: number;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPriceCents: number;
  discountBps: number;
  amountCents: number;
};

/** Line items table; collapses to stacked rows on small screens. */
export function ItemsTable({
  items,
  currency,
}: {
  items: LineItem[];
  currency: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-2 pr-3 font-medium text-muted-foreground">Description</th>
            <th className="pb-2 px-3 text-right font-medium text-muted-foreground">Qté</th>
            <th className="pb-2 px-3 text-right font-medium text-muted-foreground">P.U.</th>
            <th className="pb-2 pl-3 text-right font-medium text-muted-foreground">Montant</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.position} className="border-b border-border/60">
              <td className="py-3 pr-3 text-foreground">
                {item.description}
                {item.discountBps > 0 ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (remise {item.discountBps / 100} %)
                  </span>
                ) : null}
              </td>
              <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                {formatQuantity(item.quantity)}
                {item.unit ? ` ${item.unit}` : ''}
              </td>
              <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                {formatAmount(item.unitPriceCents, currency)}
              </td>
              <td className="py-3 pl-3 text-right tabular-nums font-medium text-foreground">
                {formatAmount(item.amountCents, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Totals block: subtotal, discount, tax and the grand total. */
export function TotalsBlock({
  currency,
  subtotalCents,
  discountCents,
  taxRateBps,
  taxCents,
  totalCents,
  dueCents,
}: {
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  dueCents?: number;
}) {
  return (
    <div className="mt-6 flex justify-end">
      <dl className="w-full space-y-2 sm:w-72">
        <div className="flex justify-between text-sm">
          <dt className="text-muted-foreground">Sous-total</dt>
          <dd className="tabular-nums text-foreground">
            {formatAmount(subtotalCents, currency)}
          </dd>
        </div>

        {discountCents > 0 ? (
          <div className="flex justify-between text-sm">
            <dt className="text-muted-foreground">Remise</dt>
            <dd className="tabular-nums text-foreground">
              -{formatAmount(discountCents, currency)}
            </dd>
          </div>
        ) : null}

        <div className="flex justify-between text-sm">
          <dt className="text-muted-foreground">TVA ({taxRateBps / 100} %)</dt>
          <dd className="tabular-nums text-foreground">{formatAmount(taxCents, currency)}</dd>
        </div>

        <div className="flex justify-between border-t border-border pt-2">
          <dt className="font-semibold text-foreground">Total</dt>
          <dd className="tabular-nums text-lg font-semibold text-foreground">
            {formatAmount(totalCents, currency)}
          </dd>
        </div>

        {dueCents !== undefined && dueCents !== totalCents ? (
          <div className="flex justify-between rounded-lg bg-primary/5 px-3 py-2">
            <dt className="text-sm font-medium text-foreground">Reste à payer</dt>
            <dd className="tabular-nums text-sm font-semibold text-primary">
              {formatAmount(dueCents, currency)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
