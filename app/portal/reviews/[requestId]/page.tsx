import { headers } from 'next/headers';
import { DocumentHeader, PortalError } from '../../_components/shared';
import { ReviewForm } from './review-form';
import { Star } from 'lucide-react';

/** Review request screen for the client portal (MVP3 §5). */

type ReviewRequestResponse = {
  reviewRequest: {
    id: string;
    status: string;
    projectName: string | null;
    expiresAt: string | null;
    expired: boolean;
  };
  organization: { name: string; brandColor: string } | null;
  alreadySubmitted: { rating: number; comment: string | null } | null;
  canSubmit: boolean;
};

async function loadReviewRequest(
  requestId: string,
  token: string
): Promise<ReviewRequestResponse | { error: string; status: number }> {
  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  const base = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

  const response = await fetch(
    `${base}/api/v1/portal/reviews/${requestId}?token=${encodeURIComponent(token)}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      error: body?.error?.message || body?.message || 'Demande indisponible',
    };
  }

  return response.json();
}

export default async function PortalReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { requestId } = await params;
  const { token } = await searchParams;

  if (!token) {
    return (
      <PortalError
        title="Lien incomplet"
        message="Ce lien ne contient pas de jeton d'accès. Utilisez le lien exact reçu par email."
      />
    );
  }

  const result = await loadReviewRequest(requestId, token);

  if ('error' in result) {
    return (
      <PortalError
        title={result.status === 404 ? 'Demande introuvable' : 'Accès refusé'}
        message={
          result.status === 403
            ? "Ce lien a expiré ou n'est plus valide."
            : result.error
        }
      />
    );
  }

  const { reviewRequest, organization, alreadySubmitted, canSubmit } = result;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <DocumentHeader
          eyebrow={organization?.name ?? 'Demande d’avis'}
          title="Votre retour nous intéresse"
          reference={reviewRequest.projectName}
        />

        <p className="mt-2 text-sm text-muted-foreground">
          Quelques secondes suffisent pour nous aider à progresser.
        </p>
      </div>

      {alreadySubmitted ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground">Merci pour votre avis</h2>
          <div className="mt-3 flex gap-1" aria-label={`Note : ${alreadySubmitted.rating} sur 5`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className={`h-5 w-5 ${
                  value <= alreadySubmitted.rating
                    ? 'fill-warning text-warning'
                    : 'text-muted-foreground/40'
                }`}
                aria-hidden
              />
            ))}
          </div>
          {alreadySubmitted.comment ? (
            <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
              {alreadySubmitted.comment}
            </p>
          ) : null}
        </div>
      ) : reviewRequest.expired ? (
        <PortalError
          title="Demande expirée"
          message="Cette demande d’avis n’est plus ouverte. Contactez votre interlocuteur si vous souhaitez tout de même répondre."
        />
      ) : canSubmit ? (
        <ReviewForm requestId={requestId} token={token} />
      ) : null}
    </div>
  );
}
