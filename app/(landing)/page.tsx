import type { Metadata } from 'next';
import {
  Benefits,
  CTA,
  Hero,
  Pricing,
  Stats,
  Steps,
  Testimonials,
} from './_components/sections';
import { FAQ } from './_components/faq-footer';
import { siteDetails } from './_data/content';

export const metadata: Metadata = {
  title: `${siteDetails.name} — ${siteDetails.tagline}`,
  description: siteDetails.description,
};

/** Public landing page (structure adapted from the Finwise template, MIT). */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Benefits />
      <Steps />
      <Pricing />
      <Testimonials />
      <FAQ />
      <Stats />
      <CTA />
    </>
  );
}
