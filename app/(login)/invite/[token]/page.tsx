import Link from 'next/link';
import { CalendarX2, MailWarning, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthShell } from '../../auth-shell';
import { getInvitationByToken } from '@/lib/invitations';
import { getSession } from '@/lib/auth/session';
import { AcceptInvitation } from './accept-invitation';

/**
 * Landing page for an invitation link.
 *
 * The lookup happens on the server so a visitor sees who invited them and to
 * which organization before being asked to sign in. Nothing is accepted here —
 * that stays a deliberate action behind `POST /api/v1/invitations/accept`.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);
  const user = await getSession();

  if (!invitation) {
    return (
      <AuthShell>
        <Notice
          icon={<MailWarning className="h-6 w-6" />}
          tone="danger"
          title="Invitation introuvable"
          description="Ce lien n’existe pas ou a été révoqué. Demandez une nouvelle invitation à votre équipe."
        >
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-in">Aller à la connexion</Link>
          </Button>
        </Notice>
      </AuthShell>
    );
  }

  if (invitation.status === 'accepted') {
    return (
      <AuthShell>
        <Notice
          icon={<UserCheck className="h-6 w-6" />}
          tone="success"
          title="Invitation déjà acceptée"
          description={`Vous faites déjà partie de ${invitation.organizationName}.`}
        >
          <Button asChild className="w-full">
            <Link href="/dashboard">Ouvrir mon espace</Link>
          </Button>
        </Notice>
      </AuthShell>
    );
  }

  if (invitation.status === 'expired') {
    return (
      <AuthShell>
        <Notice
          icon={<CalendarX2 className="h-6 w-6" />}
          tone="warning"
          title="Invitation expirée"
          description={`Le lien envoyé par ${invitation.invitedByName} a dépassé sa durée de validité. Demandez-lui d’en renvoyer un.`}
        >
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-in">Aller à la connexion</Link>
          </Button>
        </Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AcceptInvitation
        token={token}
        email={invitation.email}
        role={invitation.role}
        organizationName={invitation.organizationName}
        invitedByName={invitation.invitedByName}
        signedInEmail={user?.email ?? null}
      />
    </AuthShell>
  );
}

const TONE_CLASSES = {
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-destructive/10 text-destructive',
} as const;

function Notice({
  icon,
  tone,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TONE_CLASSES;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 text-center">
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}
      >
        {icon}
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-normal">{title}</h1>
        <p className="text-sm text-muted-foreground text-balance">{description}</p>
      </div>
      {children}
    </div>
  );
}
