import { headers } from 'next/headers';
import { DocumentHeader, PortalError, formatDate } from '../../_components/shared';
import { ReviewPanel } from './review-panel';
import { CheckCircle2, FileText } from 'lucide-react';

/** Deliverable review screen for the client portal (MVP3 §5). */

type DeliverableResponse = {
  deliverable: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    version: number;
    fileName: string | null;
    fileSizeBytes: number | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
  };
  organization: { name: string; brandColor: string } | null;
  canReview: boolean;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function loadDeliverable(
  id: string,
  token: string
): Promise<DeliverableResponse | { error: string; status: number }> {
  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  const base = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

  const response = await fetch(
    `${base}/api/v1/portal/deliverables/${id}?token=${encodeURIComponent(token)}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      error: body?.error?.message || body?.message || 'Document indisponible',
    };
  }

  return response.json();
}

export default async function PortalDeliverablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  if (!token) {
    return (
      <PortalError
        title="Lien incomplet"
        message="Ce lien ne contient pas de jeton d'accès. Utilisez le lien exact reçu par email."
      />
    );
  }

  const result = await loadDeliverable(id, token);

  if ('error' in result) {
    return (
      <PortalError
        title={result.status === 404 ? 'Document introuvable' : 'Accès refusé'}
        message={
          result.status === 403
            ? "Ce lien a expiré ou n'est plus valide. Demandez-en un nouveau à votre interlocuteur."
            : result.error
        }
      />
    );
  }

  const { deliverable, organization, canReview } = result;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <DocumentHeader
          eyebrow={organization?.name ?? 'Livrable'}
          title={deliverable.title}
          reference={deliverable.version > 1 ? `Version ${deliverable.version}` : null}
          status={deliverable.status}
          meta={
            deliverable.submittedAt ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Transmis le {formatDate(deliverable.submittedAt)}
              </p>
            ) : null
          }
        />

        {deliverable.description ? (
          <>
            <hr className="my-6 border-border" />
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {deliverable.description}
            </p>
          </>
        ) : null}

        {deliverable.fileName ? (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {deliverable.fileName}
              </p>
              {deliverable.fileSizeBytes ? (
                <p className="text-xs text-muted-foreground">
                  {formatSize(deliverable.fileSizeBytes)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {deliverable.status === 'approved' ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <div>
              <h2 className="font-semibold text-foreground">Livrable approuvé</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Approuvé le {formatDate(deliverable.reviewedAt)}.
              </p>
            </div>
          </div>
        </div>
      ) : deliverable.rejectionReason ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground">Corrections demandées</h2>
          <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
            {deliverable.rejectionReason}
          </p>
        </div>
      ) : canReview ? (
        <ReviewPanel deliverableId={id} token={token} />
      ) : null}
    </div>
  );
}
