import type { ReactNode } from 'react';
import { LandingHeader } from './_components/header';
import { LandingFooter } from './_components/faq-footer';
import { LandingMotionProvider } from './_components/motion-provider';

/**
 * Public marketing shell.
 *
 * Separate from the app layout: visitors here have no session, so the header
 * offers sign-in and sign-up rather than account navigation.
 */
export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <LandingMotionProvider>
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main>{children}</main>
        <LandingFooter />
      </div>
    </LandingMotionProvider>
  );
}
