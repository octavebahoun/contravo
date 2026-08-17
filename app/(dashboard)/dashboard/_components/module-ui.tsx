'use client';

import type { ReactNode } from 'react';
import { Stamp, type StampTone } from '@/components/stamp';

/**
 * Pieces shared by the business-module screens (contracts, deliverables,
 * expenses, reviews).
 */

export const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Renders a `*_cents` column as it is stored, with no division: XOF has no
 * subunit, and the quotes/invoices screens already display these columns that
 * way. Changing the convention here alone would make the same amount read
 * differently from one screen to the next.
 */
export function formatAmount(amount: string | number | bigint, currency = 'XOF') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `— ${currency}`;
  return `${value.toLocaleString('fr-FR')} ${currency}`;
}

/** Short French date; returns an em dash for null timestamps. */
export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/**
 * Les tons hérités des écrans métier retombent sur les quatre tons du cachet :
 * vert pour l'argent et le succès, soleil pour l'attente, rouge pour le refus,
 * encre pour tout le reste.
 */
const TONE_STAMP: Record<StatusTone, StampTone> = {
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
  neutral: 'ink',
  info: 'ink',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Stamp label={String(children)} tone={TONE_STAMP[tone]} />;
}

/** Page title block reused by every module screen. */
export function ModuleHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
      <div>
        <h1 className="font-heading text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Single KPI tile matching the existing dashboard cards. */
export function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-row items-center justify-between pb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="tabular-mono text-2xl font-semibold text-foreground">{value}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}