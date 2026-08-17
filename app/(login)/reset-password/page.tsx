'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { AuthShell } from '../auth-shell';

/** Mirrors `resetPasswordSchema`, so the form rejects what the API would reject. */
const MIN_PASSWORD_LENGTH = 12;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password !== confirmation) {
      setError('Les deux mots de passe ne sont pas identiques.');
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The API rejects breached passwords via HaveIBeenPwned, so the message
        // it returns is worth showing verbatim rather than a generic failure.
        const details = data?.error?.details?.newPassword?.[0];
        throw new Error(details || data?.error?.message || 'Impossible de réinitialiser le mot de passe.');
      }

      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setIsPending(false);
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col gap-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-normal">Lien invalide</h1>
          <p className="text-sm text-muted-foreground text-balance">
            Ce lien de réinitialisation est incomplet. Demandez-en un nouveau depuis la page de connexion.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Demander un nouveau lien</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-normal">Mot de passe modifié</h1>
          <p className="text-sm text-muted-foreground text-balance">
            Vos autres sessions ont été déconnectées par sécurité. Connectez-vous avec votre nouveau mot de passe.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.push('/sign-in')}>
          Se connecter
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-normal">Nouveau mot de passe</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Choisissez un mot de passe d’au moins {MIN_PASSWORD_LENGTH} caractères.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="password">Nouveau mot de passe</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={100}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldDescription>{MIN_PASSWORD_LENGTH} caractères minimum.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirmation">Confirmer le mot de passe</FieldLabel>
          <Input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={100}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Field>
          <Button type="submit" disabled={isPending || !password} className="w-full">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Enregistrement…
              </>
            ) : (
              'Définir mon mot de passe'
            )}
          </Button>

          <FieldDescription className="text-center mt-4">
            <Link href="/sign-in" className="underline underline-offset-4 font-semibold text-foreground">
              Retour à la connexion
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
