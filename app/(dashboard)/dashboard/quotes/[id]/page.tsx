'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Ban, Download, Loader2, Send } from 'lucide-react';
import { Stamp, type StampTone } from '@/components/stamp';
import { toast } from 'sonner';
import {
  BackLink,
  DetailFallback,
  InfoGrid,
  InfoRow,
  formatDate,
  formatDateTime,
  formatMoney,
} from '../../_components/detail-ui';

/**
 * Quote detail (MVP3 §5).
 *
 * Shows the lines and the totals the PDF is built from, plus the two
 * transitions the team owns: `send` (which mints the client's portal token and
 * emits `quote.sent`) and `cancel`. Accepting or rejecting belongs to the
 * client and happens through the portal, so those are read-only here.
 */

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const readError = (data: any, fallback: string) =>
  data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || fallback;


interface QuoteItem {
  id: string;
  position: number;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPriceCents: string;
  discountBps: number;
  amountCents: string;
}

interface Quote {
  id: string;
  projectId: string;
  clientId: string;
  number: string;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  currency: string;
  subtotalCents: string;
  discountCents: string;
  taxRateBps: number;
  taxCents: string;
  totalCents: string;
  validUntil?: string | null;
  notes?: string | null;
  terms?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  acceptedByEmail?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  items: QuoteItem[];
}

const QUOTE_STATUS: Record<string, { label: string; tone: StampTone }> = {
  draft: { label: 'Brouillon', tone: 'ink' },
  sent: { label: 'Envoyé', tone: 'warning' },
  viewed: { label: 'Vu par le client', tone: 'warning' },
  accepted: { label: 'Accepté', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'destructive' },
  expired: { label: 'Expiré', tone: 'warning' },
  cancelled: { label: 'Annulé', tone: 'ink' },
};

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: quote, error, isLoading, mutate } = useSWR<Quote>(`/api/v1/quotes/${id}`, fetcher);
  const { data: client } = useSWR<{ id: string; displayName: string; email: string }>(
    quote?.clientId ? `/api/v1/clients/${quote.clientId}` : null,
    fetcher
  );
  const { data: project } = useSWR<{ id: string; name: string; code: string }>(
    quote?.projectId ? `/api/v1/projects/${quote.projectId}` : null,
    fetcher
  );

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleTransition = async (action: 'send' | 'cancel') => {
    setPendingAction(action);
    try {
      const res = await fetch(`/api/v1/quotes/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Transition refusée'));

      toast.success(action === 'send' ? 'Devis envoyé au client' : 'Devis annulé');
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Transition impossible');
    } finally {
      setPendingAction(null);
    }
  };

  if (isLoading) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto">
        <DetailFallback>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </DetailFallback>
      </section>
    );
  }

  if (error || !quote?.id) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
        <BackLink href="/dashboard/quotes" label="Retour aux devis" />
        <DetailFallback>Ce devis est introuvable ou a été supprimé.</DetailFallback>
      </section>
    );
  }

  const status = QUOTE_STATUS[quote.status] ?? { label: quote.status, tone: 'ink' as const };
  const canSend = quote.status === 'draft';
  const canCancel = quote.status === 'sent' || quote.status === 'viewed';

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-4 border-b border-border pb-6">
        <BackLink href="/dashboard/quotes" label="Retour aux devis" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-normal text-foreground tracking-tight">
                Devis {quote.number}
              </h1>
              <Stamp label={status.label} tone={status.tone} />
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {client?.displayName ? (
                <Link href={`/dashboard/clients/${quote.clientId}`} className="text-primary hover:underline">
                  {client.displayName}
                </Link>
              ) : (
                'Client'
              )}
              {project?.name && (
                <>
                  {' · '}
                  <Link href={`/dashboard/projects/${quote.projectId}`} className="text-primary hover:underline">
                    {project.name}
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canSend && (
              <Button
                onClick={() => handleTransition('send')}
                disabled={pendingAction !== null}
                className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11 px-5"
              >
                {pendingAction === 'send' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Envoyer au client
              </Button>
            )}

            {canCancel && (
              <Button
                variant="outline"
                onClick={() => handleTransition('cancel')}
                disabled={pendingAction !== null}
                className="rounded-lg text-xs font-semibold h-11 px-5 border-border text-destructive hover:bg-destructive/10"
              >
                {pendingAction === 'cancel' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="mr-2 h-4 w-4" />
                )}
                Annuler
              </Button>
            )}

            <Button
              asChild
              variant="outline"
              className="rounded-lg text-xs font-semibold h-11 px-5 border-border"
            >
              <a href={`/api/v1/quotes/${quote.id}/pdf/download`}>
                <Download className="mr-2 h-4 w-4" /> PDF
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-medium text-foreground">Informations</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <InfoGrid>
            <InfoRow label="Numéro">{quote.number}</InfoRow>
            <InfoRow label="Valide jusqu’au">{formatDate(quote.validUntil)}</InfoRow>
            <InfoRow label="Créé le">{formatDate(quote.createdAt)}</InfoRow>
            <InfoRow label="Envoyé le">{formatDateTime(quote.sentAt)}</InfoRow>
            <InfoRow label="Vu le">{formatDateTime(quote.viewedAt)}</InfoRow>
            <InfoRow label="Accepté le">{formatDateTime(quote.acceptedAt)}</InfoRow>
          </InfoGrid>

          {quote.acceptedByName && (
            <p className="text-xs text-muted-foreground mt-5 pt-4 border-t border-border">
              Signé par <span className="text-foreground">{quote.acceptedByName}</span>
              {quote.acceptedByEmail ? ` (${quote.acceptedByEmail})` : ''}.
            </p>
          )}

          {quote.rejectedAt && (
            <p className="text-xs text-destructive mt-5 pt-4 border-t border-border">
              Refusé le {formatDateTime(quote.rejectedAt)}
              {quote.rejectionReason ? ` — ${quote.rejectionReason}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border">
          <CardTitle className="text-sm font-medium text-foreground">Lignes du devis</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Détail exactement tel qu’il apparaît sur le PDF envoyé au client.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs font-semibold text-foreground">Description</TableHead>
                <TableHead className="text-xs font-semibold text-foreground">Qté</TableHead>
                <TableHead className="text-xs font-semibold text-foreground">Prix unitaire</TableHead>
                <TableHead className="text-xs font-semibold text-foreground">Remise</TableHead>
                <TableHead className="text-xs font-semibold text-foreground text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(quote.items || []).map((item) => (
                <TableRow key={item.id} className="border-border">
                  <TableCell className="text-xs text-foreground">{item.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Number(item.quantity).toLocaleString('fr-FR')} {item.unit || ''}
                  </TableCell>
                  <TableCell className="tabular-mono text-xs text-muted-foreground">
                    {formatMoney(item.unitPriceCents, quote.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.discountBps ? `${(item.discountBps / 100).toFixed(2)} %` : '—'}
                  </TableCell>
                  <TableCell className="tabular-mono text-xs font-medium text-foreground text-right">
                    {formatMoney(item.amountCents, quote.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="p-5 border-t border-border space-y-2 max-w-xs ml-auto">
            <div className="tabular-mono flex justify-between text-xs text-muted-foreground">
              <span>Sous-total</span>
              <span>{formatMoney(quote.subtotalCents, quote.currency)}</span>
            </div>
            {Number(quote.discountCents) > 0 && (
              <div className="tabular-mono flex justify-between text-xs text-muted-foreground">
                <span>Remise</span>
                <span>-{formatMoney(quote.discountCents, quote.currency)}</span>
              </div>
            )}
            <div className="tabular-mono flex justify-between text-xs text-muted-foreground">
              <span>TVA ({(quote.taxRateBps / 100).toFixed(2)} %)</span>
              <span>{formatMoney(quote.taxCents, quote.currency)}</span>
            </div>
            <div className="tabular-mono flex justify-between text-sm font-medium text-foreground pt-2 border-t border-border">
              <span>Total</span>
              <span>{formatMoney(quote.totalCents, quote.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {(quote.notes || quote.terms) && (
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Notes & conditions</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            {quote.notes && (
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Notes</div>
                <p className="text-xs text-foreground whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Conditions</div>
                <p className="text-xs text-foreground whitespace-pre-wrap">{quote.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
