import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Split layout shared by every unauthenticated screen (sign-in, sign-up,
 * password reset). Extracted so the marketing panel on the right lives in one
 * place instead of being copied into each new page.
 */
export function AuthShell({ children }: { children: ReactNode }) {
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
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      <div className="relative hidden bg-muted lg:block border-l border-border">
        <div className="absolute inset-0 flex flex-col justify-between p-12 bg-[radial-gradient(var(--border)_1.5px,transparent_1.5px)] [background-size:24px_24px]">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-accent/10 border border-accent/20 text-accent h-8 w-8 flex items-center justify-center font-bold text-xs font-mono">
              C
            </div>
            <span className="font-mono text-xs text-muted-foreground tracking-wider">CONTRAVO // SECURE_PORTAL</span>
          </div>

          <div className="space-y-6">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground max-w-md leading-tight">
              Gérez vos contrats et factures avec une clarté absolue.
            </h2>
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
              Une interface sans distraction, conçue pour les équipes exigeantes qui recherchent l'efficacité et la sécurité de signature.
            </p>
          </div>

          <div className="border-t border-border pt-6">
            <blockquote className="text-xs italic text-muted-foreground leading-relaxed">
              "La signature électronique sécurisée par empreinte cryptographique SHA-256 nous assure une traçabilité totale et inaltérable."
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}
