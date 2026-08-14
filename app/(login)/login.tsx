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
    <div className="grid min-h-svh lg:grid-cols-2 bg-background">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
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
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <form action={formAction} className="flex flex-col gap-6">
              <input type="hidden" name="redirect" value={redirect || ''} />
              <input type="hidden" name="inviteId" value={inviteId || ''} />

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
                          href={`/sign-up${redirect ? `?redirect=${redirect}` : ''}`}
                          className="underline underline-offset-4 font-semibold text-foreground"
                        >
                          Créer un compte
                        </Link>
                      </>
                    ) : (
                      <>
                        Vous avez déjà un compte ?{' '}
                        <Link
                          href={`/sign-in${redirect ? `?redirect=${redirect}` : ''}`}
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
          </div>
        </div>
      </div>
      <div className="relative hidden bg-zinc-950 lg:block border-l border-zinc-800">
        <div className="absolute inset-0 flex flex-col justify-between p-12 bg-[radial-gradient(#1A433A_1.5px,transparent_1.5px)] [background-size:24px_24px]">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 h-8 w-8 flex items-center justify-center font-bold text-xs font-mono">
              C
            </div>
            <span className="font-mono text-xs text-zinc-400 tracking-wider">CONTRAVO // SECURE_PORTAL</span>
          </div>

          <div className="space-y-6">
            <h2 className="text-3xl font-normal tracking-tight text-white max-w-md leading-tight">
              Gérez vos contrats et factures avec une clarté absolue.
            </h2>
            <p className="text-zinc-400 text-sm max-w-sm leading-relaxed">
              Une interface sans distraction, conçue pour les équipes exigeantes qui recherchent l'efficacité et la sécurité de signature.
            </p>
          </div>

          <div className="border-t border-zinc-900 pt-6">
            <blockquote className="text-xs italic text-zinc-400 leading-relaxed">
              "La signature électronique sécurisée par empreinte cryptographique SHA-256 nous assure une traçabilité totale et inaltérable."
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}
