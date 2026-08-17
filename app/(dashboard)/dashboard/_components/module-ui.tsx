'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';

/**
 * Pieces shared by the business-module screens (contracts, deliverables,
 * expenses, reviews).
 *
 * The older screens (clients, projects, quotes, invoices) each carry their own
 * copy of these helpers; the palette below is theirs, kept identical so the new
 * modules do not read as a different product. Reconciling all of them with the
 * design tokens is a separate piece of work.
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

export type StatusTone = 'success' | 'info' | 'danger' | 'warning' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-[#05b169]/10 text-[#05b169] border-[#05b169]/20',
  info: 'bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20',
  danger: 'bg-[#cf202f]/10 text-[#cf202f] border-[#cf202f]/20',
  warning: 'bg-[#f4b000]/10 text-[#b98600] border-[#f4b000]/20',
  neutral: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Badge
      className={`${TONE_CLASSES[tone]} rounded-full text-[10px] font-medium shadow-none`}
    >
      {children}
    </Badge>
  );
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
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight font-sans">
          {title}
        </h1>
        <p className="text-[#5b616e] text-sm mt-1">{description}</p>
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
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-row items-center justify-between pb-2">
        <span className="text-xs font-medium text-[#5b616e]">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-medium text-[#0a0b0d]">{value}</div>
      {hint && <p className="text-[11px] text-[#7c828a] mt-1">{hint}</p>}
    </div>
  );
}
