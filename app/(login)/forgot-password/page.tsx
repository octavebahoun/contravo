'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { AuthShell } from '../auth-shell';

/**
 * Password reset request.
 *
 * The screen always confirms, whatever the email: the API deliberately does not
 * say whether an account exists, and showing "unknown address" here would give
 * that away anyway.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsPending(true);

    try {
      const res = await fetch('/api/v1/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Impossible d’envoyer le lien de réinitialisation.');
      }

      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setIsPending(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <div className="flex flex-col gap-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <MailCheck className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-normal">Vérifiez votre boîte mail</h1>
            <p className="text-sm text-muted-foreground text-balance">
              Si un compte existe pour <span className="font-medium text-foreground">{email}</span>, un lien de
              réinitialisation vient d’être envoyé. Il expire dans une heure.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-in">Retour à la connexion</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-normal">Mot de passe oublié</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Entrez votre email, nous vous enverrons un lien pour définir un nouveau mot de passe.
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              required
              maxLength={255}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Field>
            <Button type="submit" disabled={isPending || !email} className="w-full">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Envoi en cours…
                </>
              ) : (
                'Envoyer le lien'
              )}
            </Button>

            <FieldDescription className="text-center mt-4">
              <Link
                href="/sign-in"
                className="underline underline-offset-4 font-semibold text-foreground"
              >
                Retour à la connexion
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
