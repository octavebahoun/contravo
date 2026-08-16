import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background py-8">
      <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">
          © 2026 Contravo
        </span>
        <div className="flex items-center gap-6">
          <Link href="#cgu" className="text-sm text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider font-heading font-semibold text-xs">
            CGU
          </Link>
          <Link href="#confidentialite" className="text-sm text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider font-heading font-semibold text-xs">
            Confidentialité
          </Link>
          <Link href="#contact" className="text-sm text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider font-heading font-semibold text-xs">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
