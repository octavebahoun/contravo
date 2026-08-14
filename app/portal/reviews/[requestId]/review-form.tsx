'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Star } from 'lucide-react';

/**
 * Review submission form (MVP3 §5).
 *
 * The rating is the only required field; the comment is optional so a busy
 * client can answer in one click.
 */
export function ReviewForm({
  requestId,
  token,
}: {
  requestId: string;
  token: string;
}) {
  const router = useRouter();

  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (rating === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/portal/reviews/${requestId}?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            ...(comment.trim() ? { comment: comment.trim() } : {}),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message || data?.message || "L'envoi a échoué.");
        return;
      }

      router.refresh();
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  const shown = hovered || rating;

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Votre avis</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Comment évalueriez-vous cette collaboration ?
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <Label>Note</Label>
          <div className="mt-2 flex gap-1" onMouseLeave={() => setHovered(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHovered(value)}
                disabled={submitting}
                aria-label={`${value} étoile${value > 1 ? 's' : ''}`}
                className="rounded p-1 transition-transform hover:scale-110 disabled:cursor-not-allowed"
              >
                <Star
                  className={`h-8 w-8 ${
                    value <= shown
                      ? 'fill-warning text-warning'
                      : 'text-muted-foreground/40'
                  }`}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="reviewComment">Commentaire (facultatif)</Label>
          <Textarea
            id="reviewComment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ce qui vous a plu, ce qui pourrait être amélioré…"
            rows={4}
            className="mt-1.5"
            disabled={submitting}
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={rating === 0 || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Envoi…
            </>
          ) : (
            'Envoyer mon avis'
          )}
        </Button>
      </div>
    </form>
  );
}
