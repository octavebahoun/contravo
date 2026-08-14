import { headers } from 'next/headers';
import { DocumentHeader, PortalError, formatDate } from '../../_components/shared';
import { SignPanel } from './sign-panel';
import { CheckCircle2 } from 'lucide-react';

/**
 * Contract review and signing screen (MVP4 §7.1).
 *
 * Fetched server-side so the terms are in the HTML the recipient receives:
 * the document must be readable even if client JavaScript never runs. Only the
 * signing panel below is interactive.
 */

type ContractResponse = {
  contract: {
    id: string;
    number: string;
    title: string;
    status: string;
    bodyMarkdown: string;
    signedAt: string | null;
    signedByName: string | null;
    expiresAt: string | null;
  };
  organization: { name: string; brandColor: string } | null;
  recipientEmail: string | null;
  canSign: boolean;
};

async function loadContract(
  id: string,
  token: string
): Promise<ContractResponse | { error: string; status: number }> {
  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  const base = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

  const response = await fetch(
    `${base}/api/v1/portal/contracts/${id}?token=${encodeURIComponent(token)}`,
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

/**
 * Renders the contract body.
 *
 * Markdown is converted to plain blocks rather than HTML: the text comes from
 * the issuing organization, and injecting it as HTML would let a malicious
 * clause run script in the recipient's browser.
 */
function ContractBody({ markdown }: { markdown: string }) {
  const blocks = markdown.replace(/\r\n/g, '\n').split('\n');

  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground">
      {blocks.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          const size =
            heading[1].length === 1
              ? 'text-lg font-semibold'
              : heading[1].length === 2
                ? 'text-base font-semibold'
                : 'text-sm font-semibold';
          return (
            <h2 key={i} className={`${size} mt-5 text-foreground`}>
              {heading[2].replace(/\*\*/g, '')}
            </h2>
          );
        }

        const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
        if (bullet) {
          return (
            <p key={i} className="pl-5 text-muted-foreground">
              • {bullet[1].replace(/\*\*/g, '')}
            </p>
          );
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          return <hr key={i} className="border-border" />;
        }

        return (
          <p key={i} className="text-muted-foreground">
            {trimmed.replace(/\*\*/g, '')}
          </p>
        );
      })}
    </div>
  );
}

export default async function PortalContractPage({
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

  const result = await loadContract(id, token);

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

  const { contract, organization, recipientEmail, canSign } = result;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <DocumentHeader
          eyebrow={organization?.name ?? 'Contrat'}
          title={contract.title}
          reference={contract.number}
          status={contract.status}
          meta={
            contract.expiresAt && !contract.signedAt ? (
              <p className="mt-2 text-sm text-muted-foreground">
                À signer avant le {formatDate(contract.expiresAt)}
              </p>
            ) : null
          }
        />

        <hr className="my-6 border-border" />
        <ContractBody markdown={contract.bodyMarkdown} />
      </div>

      {contract.signedAt ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <div>
              <h2 className="font-semibold text-foreground">Contrat signé</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Signé par {contract.signedByName} le {formatDate(contract.signedAt)}. Une copie
                vous a été transmise par email.
              </p>
            </div>
          </div>
        </div>
      ) : canSign ? (
        <SignPanel contractId={id} token={token} recipientEmail={recipientEmail} />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Ce contrat n&apos;est pas ouvert à la signature pour le moment.
          </p>
        </div>
      )}
    </div>
  );
}
