import type { NextConfig } from 'next';

/**
 * Pinned to Next 15.5.x (the maintained `backport` line) rather than a canary.
 *
 * The project ran on `15.6.0-canary.59` — a canary of a version that was never
 * released as stable, since the line went 15.5.x → 16.x. That build is the prime
 * suspect for the `removeChild` crash on `/dashboard/contracts`, whose markup
 * was audited and found valid.
 *
 * `experimental.ppr` and `experimental.clientSegmentCache` were removed with it:
 * both are canary-only, and `next build` refuses to run with them on a stable
 * release. They were render optimizations, so nothing functional is lost —
 * routes that were partially prerendered are now simply server-rendered.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
