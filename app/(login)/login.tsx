'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { AuthShell } from './auth-shell';
import { signIn, signUp } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Sign-in and sign-up form (layout from the shadcn `login-02` / `signup-02` blocks).
 *
 * The block markup is kept, but the submission stays on the existing server
 * actions: `useActionState` surfaces validation errors returned by the action
 * and disables the button while it runs.
 *
 * Third-party sign-in is deliberately absent — the blocks ship a GitHub button,
 * and no OAuth provider is wired on this project.
 */
export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const inviteId = searchParams.get('inviteId');
  const inviteToken = searchParams.get('inviteToken');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  const isSignIn = mode === 'signin';

  // Keep the invitation context when the visitor switches between the two forms.
  const switchParams = new URLSearchParams();
  if (redirect) switchParams.set('redirect', redirect);
  if (inviteToken) switchParams.set('inviteToken', inviteToken);
  const switchQuery = switchParams.toString() ? `?${switchParams.toString()}` : '';

  return (
    <AuthShell>
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="redirect" value={redirect || ''} />
        <input type="hidden" name="inviteId" value={inviteId || ''} />
        <input type="hidden" name="inviteToken" value={inviteToken || ''} />

        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-normal">
              {isSignIn ? 'Connexion à votre compte' : 'Créer votre compte'}
            </h1>
            <p className="text-sm text-balance text-muted-foreground">
              {isSignIn
                ? 'Entrez votre email pour accéder à votre espace.'
                : 'Quelques secondes suffisent pour démarrer.'}
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
              defaultValue={state.email}
            />
          </Field>

          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
              {isSignIn ? (
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Mot de passe oublié ?
                </Link>
              ) : null}
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              required
              minLength={8}
              maxLength={100}
              defaultValue={state.password}
            />
            {!isSignIn ? (
              <FieldDescription>8 caractères minimum.</FieldDescription>
            ) : null}
          </Field>

          {state?.error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <Field>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Un instant…
                </>
              ) : isSignIn ? (
                'Se connecter'
              ) : (
                'Créer mon compte'
              )}
            </Button>

            <FieldDescription className="text-center mt-4">
              {isSignIn ? (
                <>
                  Pas encore de compte ?{' '}
                  <Link
                    href={`/sign-up${switchQuery}`}
                    className="underline underline-offset-4 font-semibold text-foreground"
                  >
                    Créer un compte
                  </Link>
                </>
              ) : (
                <>
                  Vous avez déjà un compte ?{' '}
                  <Link
                    href={`/sign-in${switchQuery}`}
                    className="underline underline-offset-4 font-semibold text-foreground"
                  >
                    Se connecter
                  </Link>
                </>
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
