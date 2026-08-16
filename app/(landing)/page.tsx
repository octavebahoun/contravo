import type { Metadata } from 'next';
import {
  Hero,
  LogosBand,
  BeforeAfter,
  Features,
  ProductPreview,
  Steps,
  PortailSplit,
  PaymentSplit,
  Testimonials,
  Pricing,
  FAQ,
  CTA,
} from './_components/sections';
import { siteDetails } from './_data/content';

export const metadata: Metadata = {
  title: `${siteDetails.name} — ${siteDetails.tagline}`,
  description: siteDetails.description,
};

/** Public landing page matching the brutalist wireframe layout. */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <LogosBand />
      <BeforeAfter />
      <Features />
      <ProductPreview />
      <Steps />
      <PortailSplit />
      <PaymentSplit />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
    </>
  );
}
