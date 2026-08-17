'use client';

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

/**
 * "Pay now" button on the portal invoice screen.
 *
 * Asks the server for a payment intent, then hands the browser over to the
 * gateway's checkout page. Nothing is settled here: the invoice only moves once
 * GeniusPay calls the webhook back, which re-fetches the transaction before
 * crediting it.
 *
 * Client-side because it needs a pending state and an error message; the rest of
 * the portal screen stays a server component.
 */
export function PayButton({
  invoiceId,
  token,
  amountLabel,
}: {
  invoiceId: string;
  token: string;
  amountLabel: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/portal/invoices/${invoiceId}/pay?token=${encodeURIComponent(token)}`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.checkoutUrl) {
        throw new Error(
          data?.error?.message || data?.message || 'Le paiement en ligne est momentanément indisponible.'
        );
      }

      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setError(err.message || 'Le paiement en ligne est momentanément indisponible.');
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={start}
        disabled={isStarting}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
      >
        {isStarting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <CreditCard className="h-4 w-4" aria-hidden />
        )}
        {isStarting ? 'Redirection…' : `Payer ${amountLabel} en ligne`}
      </button>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error} Vous pouvez régler par virement avec les coordonnées ci-dessous.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Carte bancaire ou Mobile Money, via notre prestataire de paiement sécurisé.
        </p>
      )}
    </div>
  );
}
