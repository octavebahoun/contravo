import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Shared pieces for the four entity detail pages (client, projet, devis,
 * facture). They all show the same things — a back link, a grid of read-only
 * fields, a status pill and money — so the markup lives here once instead of
 * being copy-pasted four times.
 */

/** Re-exported so a detail page has one import for its formatting helpers. */
export { formatMoney } from '@/lib/money';

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

type Tone = 'info' | 'success' | 'destructive' | 'warning' | 'neutral';

const TONE_VARIANT: Record<Tone, 'outline' | 'success' | 'destructive' | 'warning' | 'secondary'> = {
  info: 'outline',
  success: 'success',
  destructive: 'destructive',
  warning: 'warning',
  neutral: 'secondary',
};

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return <Badge variant={TONE_VARIANT[tone]}>{label}</Badge>;
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
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
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs text-foreground break-words">{children ?? '—'}</div>
    </div>
  );
}

export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-5">{children}</div>;
}

/** Full-width message shown while loading or when the entity does not exist. */
export function DetailFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-24 text-xs text-muted-foreground">{children}</div>
  );
}