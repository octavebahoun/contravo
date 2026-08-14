import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { faqs, footerDetails, siteDetails } from '../_data/content';
import { SectionTitle } from './sections';
import { Reveal, RevealChild, fadeUpVariants } from './motion';

/**
 * FAQ and footer (structure adapted from the Finwise template, MIT).
 *
 * The FAQ uses native `<details>` rather than a JS accordion: it stays keyboard
 * accessible, works without client JavaScript, and the answers remain findable
 * by search engines.
 */

export function FAQ() {
  return (
    <section id="faq" className="bg-secondary/40 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Reveal variants={fadeUpVariants}>
          <SectionTitle title="Questions fréquentes" />
        </Reveal>

        <Reveal className="mt-10 space-y-3">
          {faqs.map((faq) => (
            <RevealChild key={faq.question}>
            <details
              className="group rounded-xl border border-border bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-foreground">
                {faq.question}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </details>
            </RevealChild>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Image
              src="/logo.webp"
              alt="Contravo"
              width={132}
              height={36}
              className="h-9 w-auto object-contain"
            />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              {siteDetails.description}
            </p>
          </div>

          {footerDetails.columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteDetails.name}. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
