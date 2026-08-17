'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Ban, Download, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  BackLink,
  DetailFallback,
  InfoGrid,
  InfoRow,
  StatusPill,
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

type Tone = 'blue' | 'green' | 'red' | 'amber' | 'gray';

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

const QUOTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyé', tone: 'blue' },
  viewed: { label: 'Vu par le client', tone: 'blue' },
  accepted: { label: 'Accepté', tone: 'green' },
  rejected: { label: 'Refusé', tone: 'red' },
  expired: { label: 'Expiré', tone: 'amber' },
  cancelled: { label: 'Annulé', tone: 'gray' },
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
          <Loader2 className="h-5 w-5 animate-spin text-[#0052ff]" />
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

  const status = QUOTE_STATUS[quote.status] ?? { label: quote.status, tone: 'gray' as const };
  const canSend = quote.status === 'draft';
  const canCancel = quote.status === 'sent' || quote.status === 'viewed';

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-4 border-b border-gray-100 pb-6">
        <BackLink href="/dashboard/quotes" label="Retour aux devis" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight">
                Devis {quote.number}
              </h1>
              <StatusPill label={status.label} tone={status.tone} />
            </div>
            <p className="text-[#5b616e] text-sm mt-1">
              {client?.displayName ? (
                <Link href={`/dashboard/clients/${quote.clientId}`} className="text-[#0052ff] hover:underline">
                  {client.displayName}
                </Link>
              ) : (
                'Client'
              )}
              {project?.name && (
                <>
                  {' · '}
                  <Link href={`/dashboard/projects/${quote.projectId}`} className="text-[#0052ff] hover:underline">
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
                className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11 px-5"
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
                className="rounded-full text-xs font-semibold h-11 px-5 border-gray-200 text-[#cf202f] hover:bg-[#cf202f]/10"
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
              className="rounded-full text-xs font-semibold h-11 px-5 border-gray-200"
            >
              <a href={`/api/v1/quotes/${quote.id}/pdf/download`}>
                <Download className="mr-2 h-4 w-4" /> PDF
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-medium text-[#0a0b0d]">Informations</CardTitle>
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
            <p className="text-xs text-[#5b616e] mt-5 pt-4 border-t border-gray-100">
              Signé par <span className="text-[#0a0b0d]">{quote.acceptedByName}</span>
              {quote.acceptedByEmail ? ` (${quote.acceptedByEmail})` : ''}.
            </p>
          )}

          {quote.rejectedAt && (
            <p className="text-xs text-[#cf202f] mt-5 pt-4 border-t border-gray-100">
              Refusé le {formatDateTime(quote.rejectedAt)}
              {quote.rejectionReason ? ` — ${quote.rejectionReason}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100">
          <CardTitle className="text-sm font-medium text-[#0a0b0d]">Lignes du devis</CardTitle>
          <CardDescription className="text-xs text-[#5b616e]">
            Détail exactement tel qu’il apparaît sur le PDF envoyé au client.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Description</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Qté</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Prix unitaire</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d]">Remise</TableHead>
                <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(quote.items || []).map((item) => (
                <TableRow key={item.id} className="border-gray-100">
                  <TableCell className="text-xs text-[#0a0b0d]">{item.description}</TableCell>
                  <TableCell className="text-xs text-[#5b616e]">
                    {Number(item.quantity).toLocaleString('fr-FR')} {item.unit || ''}
                  </TableCell>
                  <TableCell className="text-xs text-[#5b616e]">
                    {formatMoney(item.unitPriceCents, quote.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-[#5b616e]">
                    {item.discountBps ? `${(item.discountBps / 100).toFixed(2)} %` : '—'}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-[#0a0b0d] text-right">
                    {formatMoney(item.amountCents, quote.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="p-5 border-t border-gray-100 space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-xs text-[#5b616e]">
              <span>Sous-total</span>
              <span>{formatMoney(quote.subtotalCents, quote.currency)}</span>
            </div>
            {Number(quote.discountCents) > 0 && (
              <div className="flex justify-between text-xs text-[#5b616e]">
                <span>Remise</span>
                <span>-{formatMoney(quote.discountCents, quote.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-[#5b616e]">
              <span>TVA ({(quote.taxRateBps / 100).toFixed(2)} %)</span>
              <span>{formatMoney(quote.taxCents, quote.currency)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium text-[#0a0b0d] pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{formatMoney(quote.totalCents, quote.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {(quote.notes || quote.terms) && (
        <Card className="rounded-2xl border border-gray-200 bg-white">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-medium text-[#0a0b0d]">Notes & conditions</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            {quote.notes && (
              <div className="space-y-1">
                <div className="text-[11px] text-[#7c828a]">Notes</div>
                <p className="text-xs text-[#0a0b0d] whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div className="space-y-1">
                <div className="text-[11px] text-[#7c828a]">Conditions</div>
                <p className="text-xs text-[#0a0b0d] whitespace-pre-wrap">{quote.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
