'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

/**
 * Accept / reject panel for a quote (MVP3 §5).
 *
 * The recipient retypes their email as an identity check — the same guard the
 * signing route enforces server-side — and a rejection may carry a reason,
 * which reaches the issuer through `quote.rejected`.
 */
export function QuoteActions({
  quoteId,
  token,
  recipientEmail,
}: {
  quoteId: string;
  token: string;
  recipientEmail: string | null;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<'idle' | 'accept' | 'reject'>('idle');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailMatches =
    !recipientEmail || signerEmail.trim().toLowerCase() === recipientEmail.toLowerCase();
  const ready = signerName.trim().length > 0 && emailMatches && signerEmail.length > 0;

  async function submit(decision: 'accept' | 'reject'): Promise<void> {
    if (!ready || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/portal/quotes/${quoteId}/sign?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            signerName: signerName.trim(),
            signerEmail: signerEmail.trim(),
            ...(decision === 'reject' && reason.trim() ? { reason: reason.trim() } : {}),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message || data?.message || "L'opération a échoué.");
        return;
      }

      router.refresh();
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'idle') {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Votre réponse</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Acceptez ce devis pour lancer la prestation, ou indiquez-nous pourquoi il ne convient
          pas.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => setMode('accept')} className="sm:w-auto">
            Accepter le devis
          </Button>
          <Button variant="outline" onClick={() => setMode('reject')} className="sm:w-auto">
            Refuser
          </Button>
        </div>
      </div>
    );
  }

  const accepting = mode === 'accept';

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">
        {accepting ? 'Accepter le devis' : 'Refuser le devis'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {accepting
          ? 'Confirmez votre identité pour valider ce devis.'
          : 'Confirmez votre identité et précisez, si vous le souhaitez, la raison du refus.'}
      </p>

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="quoteSignerName">Nom complet</Label>
            <Input
              id="quoteSignerName"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Jean Dupont"
              autoComplete="name"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="quoteSignerEmail">Confirmez votre email</Label>
            <Input
              id="quoteSignerEmail"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder={recipientEmail ?? 'vous@exemple.com'}
              autoComplete="email"
              className="mt-1.5"
            />
            {signerEmail.length > 0 && !emailMatches ? (
              <p className="mt-1.5 text-xs text-destructive">
                Cet email ne correspond pas à celui du destinataire du lien.
              </p>
            ) : null}
          </div>
        </div>

        {!accepting ? (
          <div>
            <Label htmlFor="rejectReason">Raison (facultatif)</Label>
            <Textarea
              id="rejectReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Budget trop élevé, délais incompatibles…"
              rows={3}
              className="mt-1.5"
            />
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => submit(accepting ? 'accept' : 'reject')}
            disabled={!ready || submitting}
            variant={accepting ? 'default' : 'destructive'}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Envoi…
              </>
            ) : accepting ? (
              'Confirmer l’acceptation'
            ) : (
              'Confirmer le refus'
            )}
          </Button>

          <Button variant="ghost" onClick={() => setMode('idle')} disabled={submitting}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
