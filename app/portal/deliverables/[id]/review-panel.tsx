'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

/**
 * Approve / reject panel for a deliverable (MVP3 §5).
 *
 * A rejection requires a reason: without it the provider has nothing to act on,
 * and the revision loop stalls.
 */
export function ReviewPanel({
  deliverableId,
  token,
}: {
  deliverableId: string;
  token: string;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<'idle' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: 'approve' | 'reject'): Promise<void> {
    if (submitting) return;
    if (action === 'reject' && reason.trim().length === 0) {
      setError('Merci d’indiquer ce qui doit être corrigé.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/portal/deliverables/${deliverableId}/${action}?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'reject' ? { reason: reason.trim() } : {}),
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

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Votre validation</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Approuvez ce livrable s’il vous convient, ou demandez des corrections.
      </p>

      {mode === 'idle' ? (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => submit('approve')} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Envoi…
              </>
            ) : (
              'Approuver'
            )}
          </Button>
          <Button variant="outline" onClick={() => setMode('reject')} disabled={submitting}>
            Demander des corrections
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="revisionReason">Ce qui doit être corrigé</Label>
            <Textarea
              id="revisionReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Décrivez les points à reprendre…"
              rows={4}
              className="mt-1.5"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="destructive"
              onClick={() => submit('reject')}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Envoi…
                </>
              ) : (
                'Envoyer la demande'
              )}
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')} disabled={submitting}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
