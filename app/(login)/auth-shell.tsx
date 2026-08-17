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
