import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Shared pieces for the four entity detail pages (client, projet, devis,
 * facture). They all show the same things — a back link, a grid of read-only
 * fields, a status pill and money — so the markup lives here once instead of
 * being copy-pasted four times.
 */

/**
 * Formats a minor-unit amount.
 *
 * XOF has no subunit: the stored value is already the displayed value, so
 * nothing is divided. The locale is pinned because the server and the browser
 * would otherwise pick different ones and React would flag a hydration
 * mismatch.
 */
export function formatMoney(cents: string | number | bigint | null | undefined, currency = 'XOF') {
  if (cents === null || cents === undefined || cents === '') return `0 ${currency}`;
  const value = typeof cents === 'string' ? Number(cents) : Number(cents);
  if (!Number.isFinite(value)) return `0 ${currency}`;
  return `${value.toLocaleString('fr-FR')} ${currency}`;
}

/** `2026-08-17` or an ISO timestamp → `17/08/2026`. */
export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Same, with the time — used for audit-ish fields (envoyé le, payé le…). */
export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Tone = 'blue' | 'green' | 'red' | 'amber' | 'gray';

const TONE_CLASS: Record<Tone, string> = {
  blue: 'bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20',
  green: 'bg-[#05b169]/10 text-[#05b169] border-[#05b169]/20',
  red: 'bg-[#cf202f]/10 text-[#cf202f] border-[#cf202f]/20',
  amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  gray: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <Badge className={`${TONE_CLASS[tone]} rounded-full text-[10px] font-medium shadow-none`}>
      {label}
    </Badge>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-[#5b616e] hover:text-[#0052ff]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

/** One label/value line inside an `InfoGrid`. */
export function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-[#7c828a]">{label}</div>
      <div className="text-xs text-[#0a0b0d] break-words">{children ?? '—'}</div>
    </div>
  );
}

export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-5">{children}</div>;
}

/** Full-width message shown while loading or when the entity does not exist. */
export function DetailFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-24 text-xs text-[#7c828a]">{children}</div>
  );
}
