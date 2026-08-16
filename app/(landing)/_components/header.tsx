'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  const navLinks = [
    { label: 'Produit', href: '#produit' },
    { label: 'Tarifs', href: '#tarifs' },
    { label: 'Docs', href: '#docs' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6">
        <nav className="flex items-center justify-between py-4">
          {/* Logo brand uppercase monospace/sans brutalist */}
          <Link href="/" className="font-heading font-black tracking-widest text-lg text-foreground hover:text-primary transition-colors">
            CONTRAVO
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-8">
            <ul className="flex items-center gap-6">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/sign-in"
                  className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                >
                  Connexion
                </Link>
              </li>
            </ul>
            <Button size="sm" asChild className="rounded-none font-heading uppercase tracking-wider text-xs px-5">
              <Link href="/sign-up">Essayer 14 jours</Link>
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-none p-2 text-foreground md:hidden border border-border hover:bg-muted"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <ul className="space-y-1 px-6 py-4">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="block py-2 text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
              >
                Connexion
              </Link>
            </li>
          </ul>

          <div className="px-6 pb-6">
            <Button asChild className="w-full rounded-none font-heading uppercase tracking-wider text-xs">
              <Link href="/sign-up" onClick={() => setOpen(false)}>
                Essayer 14 jours
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
