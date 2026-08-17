'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  member: 'Membre',
  viewer: 'Lecteur',
};

/**
 * Acceptance step of an invitation.
 *
 * Three states: signed in with the invited address (one click), signed in with
 * a different address (dead end, explained), or not signed in (sign-in and
 * sign-up links that come back here).
 */
export function AcceptInvitation({
  token,
  email,
  role,
  organizationName,
  invitedByName,
  signedInEmail,
}: {
  token: string;
  email: string;
  role: string;
  organizationName: string;
  invitedByName: string;
  signedInEmail: string | null;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  const returnTo = `/invite/${token}`;
  const matchesInvitee = signedInEmail?.toLowerCase() === email.toLowerCase();

  const handleAccept = async () => {
    setError('');
    setIsPending(true);
    try {
      const res = await fetch('/api/v1/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Impossible d’accepter l’invitation.');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.');
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0052ff]/10 text-[#0052ff]">
          <Users className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-normal">Rejoindre {organizationName}</h1>
          <p className="text-sm text-muted-foreground text-balance">
            {invitedByName} vous invite à rejoindre {organizationName} en tant que{' '}
            <span className="font-medium text-foreground">
              {(ROLE_LABELS[role] || role).toLowerCase()}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/40 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">Invitation envoyée à</p>
        <p className="text-sm font-medium">{email}</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {matchesInvitee ? (
        <Button onClick={handleAccept} disabled={isPending} className="w-full">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Un instant…
            </>
          ) : (
            'Accepter l’invitation'
          )}
        </Button>
      ) : signedInEmail ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Vous êtes connecté avec {signedInEmail}. Cette invitation ne vaut que pour {email}.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/sign-in?redirect=${encodeURIComponent(returnTo)}`}>
              Se connecter avec une autre adresse
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href={`/sign-in?redirect=${encodeURIComponent(returnTo)}`}>
              J’ai déjà un compte — me connecter
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            {/* The token goes along so sign-up joins this organization instead
                of creating a personal one the invitee never asked for. */}
            <Link href={`/sign-up?inviteToken=${encodeURIComponent(token)}`}>
              Créer mon compte
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
