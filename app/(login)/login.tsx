'use client';

import Image from 'next/image';
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

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  const isSignIn = mode === 'signin';

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Contravo — accueil">
            <Image
              src="/logo.webp"
              alt="Contravo"
              width={148}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>
        </div>

        <form action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="redirect" value={redirect || ''} />
          <input type="hidden" name="inviteId" value={inviteId || ''} />

          <FieldGroup>
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-bold">
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
              {/* The blocks ship a "forgot password" link; there is no reset
                  page yet (only the API route), so linking it would 404. */}
              <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
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
              <Button type="submit" disabled={pending}>
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

              <FieldDescription className="text-center">
                {isSignIn ? (
                  <>
                    Pas encore de compte ?{' '}
                    <Link
                      href={`/sign-up${redirect ? `?redirect=${redirect}` : ''}`}
                      className="underline underline-offset-4"
                    >
                      Créer un compte
                    </Link>
                  </>
                ) : (
                  <>
                    Vous avez déjà un compte ?{' '}
                    <Link
                      href={`/sign-in${redirect ? `?redirect=${redirect}` : ''}`}
                      className="underline underline-offset-4"
                    >
                      Se connecter
                    </Link>
                  </>
                )}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
