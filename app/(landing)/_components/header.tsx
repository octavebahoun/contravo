'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { menuItems } from '../_data/content';

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6">
        <nav className="flex items-center justify-between py-4">
          <Link href="/" className="font-heading text-lg font-extrabold tracking-tight text-foreground transition-colors hover:text-primary">
            Contravo
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <ul className="flex items-center gap-6">
              {menuItems.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Connexion
                </Link>
              </li>
            </ul>
            <Button size="sm" asChild className="h-9 px-4 text-sm font-semibold">
              <Link href="/sign-up">Créer mon premier devis</Link>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-2 text-foreground md:hidden border border-border hover:bg-muted"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <ul className="space-y-1 px-6 py-4">
            {menuItems.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Connexion
              </Link>
            </li>
          </ul>

          <div className="px-6 pb-6">
            <Button asChild className="w-full text-sm font-semibold">
              <Link href="/sign-up" onClick={() => setOpen(false)}>
                Créer mon premier devis
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}