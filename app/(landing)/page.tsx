import type { Metadata } from 'next';
import {
  Hero,
  StatusBand,
  Problem,
  Solution,
  Steps,
  Proof,
  Pricing,
  Team,
  FAQ,
  CTA,
} from './_components/sections';
import { siteDetails } from './_data/content';

export const metadata: Metadata = {
  title: `${siteDetails.name} — ${siteDetails.tagline}`,
  description: siteDetails.description,
  openGraph: {
    title: `${siteDetails.name} — ${siteDetails.tagline}`,
    description: siteDetails.description,
    type: 'website',
    locale: 'fr_FR',
  },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <StatusBand />
      <Problem />
      <Solution />
      <Steps />
      <Proof />
      <Pricing />
      <FAQ />
      <Team />
      <CTA />
    </>
  );
}