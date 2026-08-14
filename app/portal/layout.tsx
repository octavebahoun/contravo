import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * Shell for the public client portal (MVP4 §7.1).
 *
 * Rendered for recipients who arrive from an emailed link and have no account,
 * so it deliberately carries no app navigation: one document, one decision.
 */
export const metadata = {
  title: 'Contravo — Espace client',
  description: 'Consultez et validez vos documents en toute sécurité.',
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Image
            src="/logo.webp"
            alt="Contravo"
            width={132}
            height={36}
            className="h-9 w-auto object-contain"
            priority
          />
          <span className="text-sm text-muted-foreground">Espace client</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <p className="text-center text-xs text-muted-foreground">
          Document transmis via Contravo. Ce lien vous est personnel — ne le partagez pas.
        </p>
      </footer>
    </div>
  );
}
