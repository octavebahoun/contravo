'use client';

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Scroll-reveal primitives (animation values taken from the Finwise template, MIT).
 *
 * The container fades and rises while staggering its children, which slide in
 * from the left. `viewport.once` keeps a section from replaying every time it
 * scrolls back into view, which reads as noise on a long page.
 */

export const containerVariants: Variants = {
  offscreen: { opacity: 0, y: 100 },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      bounce: 0.2,
      duration: 0.9,
      delayChildren: 0.2,
      staggerChildren: 0.1,
    },
  },
};

export const childVariants: Variants = {
  offscreen: { opacity: 0, x: -50 },
  onscreen: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', bounce: 0.2, duration: 1 },
  },
};

/** Fade-and-rise used by sections that have no staggered children. */
export const fadeUpVariants: Variants = {
  offscreen: { opacity: 0, y: 40 },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', bounce: 0.2, duration: 0.8 },
  },
};

export function Reveal({
  children,
  className,
  variants = containerVariants,
  amount = 0.2,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="offscreen"
      whileInView="onscreen"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

/** A staggered child of `Reveal`; inherits the parent's animation state. */
export function RevealChild({
  children,
  className,
  variants = childVariants,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

/** Hero entrance: plays on mount rather than on scroll. */
export function HeroReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.9, delay }}
    >
      {children}
    </motion.div>
  );
}
