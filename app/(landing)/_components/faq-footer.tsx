import Link from 'next/link';
import { footerDetails } from '../_data/content';

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-heading text-base font-extrabold tracking-tight text-foreground">
              Contravo
            </span>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Devis, contrats et factures signés en ligne, encaissés par mobile money.
            </p>
          </div>
          <div className="flex gap-12">
            {footerDetails.columns.map((column) => (
              <div key={column.title}>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {column.title}
                </span>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-foreground/80 hover:text-primary">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <span className="text-sm text-muted-foreground">© 2026 Contravo</span>
          <div className="flex items-center gap-6">
            <Link href="#cgu" className="text-sm text-muted-foreground hover:text-primary">
              CGU
            </Link>
            <Link href="#confidentialite" className="text-sm text-muted-foreground hover:text-primary">
              Confidentialité
            </Link>
            <Link href="#contact" className="text-sm text-muted-foreground hover:text-primary">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}