'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { SignaturePad } from '../../_components/signature-pad';

/**
 * Signing panel for a contract (MVP4 §7.1).
 *
 * Walks the four required inputs — consent, drawn signature, name, and the
 * email retyped as an identity check — then posts to the signing pipeline.
 * The submit button stays disabled until all four are satisfied, so the
 * recipient never hits a server-side rejection for a missing field.
 */
export function SignPanel({
  contractId,
  token,
  recipientEmail,
}: {
  contractId: string;
  token: string;
  recipientEmail: string | null;
}) {
  const router = useRouter();

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const emailMatches =
    !recipientEmail || signerEmail.trim().toLowerCase() === recipientEmail.toLowerCase();

  const ready =
    accepted && signature !== null && signerName.trim().length > 0 && emailMatches;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!ready || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/portal/contracts/${contractId}/sign?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerName: signerName.trim(),
            signerEmail: signerEmail.trim(),
            signatureBase64: signature,
            acceptedTerms: accepted,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message || data?.message || 'La signature a échoué.');
        return;
      }

      setDone(true);
      // Refresh so the page re-renders from the signed state.
      router.refresh();
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-foreground">Contrat signé</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Une copie signée vous a été envoyée par email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Signer le contrat</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Votre signature vaut acceptation des termes ci-dessus.
      </p>

      <div className="mt-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="signerName">Nom complet</Label>
            <Input
              id="signerName"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Jean Dupont"
              autoComplete="name"
              required
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="signerEmail">Confirmez votre email</Label>
            <Input
              id="signerEmail"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder={recipientEmail ?? 'vous@exemple.com'}
              autoComplete="email"
              required
              className="mt-1.5"
            />
            {signerEmail.length > 0 && !emailMatches ? (
              <p className="mt-1.5 text-xs text-destructive">
                Cet email ne correspond pas à celui du destinataire du lien.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <Label>Votre signature</Label>
          <div className="mt-1.5">
            <SignaturePad onChange={setSignature} disabled={submitting} />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="accepted"
            checked={accepted}
            onCheckedChange={(v) => setAccepted(v === true)}
            disabled={submitting}
          />
          <Label htmlFor="accepted" className="text-sm font-normal leading-relaxed">
            J&apos;ai lu et j&apos;accepte les termes de ce contrat.
          </Label>
        </div>

        {error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={!ready || submitting} className="w-full sm:w-auto">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Signature en cours…
            </>
          ) : (
            'Signer le contrat'
          )}
        </Button>

        <p className="text-xs text-muted-foreground">
          Signature électronique simple au sens du règlement eIDAS. Votre adresse IP et
          l&apos;horodatage sont enregistrés comme preuve.
        </p>
      </div>
    </form>
  );
}
