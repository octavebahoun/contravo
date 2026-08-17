'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Primitives d'entrée — fondu + 12px max, 150-300ms, easing doux.
 * `prefers-reduced-motion` : rendu statique, pas d'animation.
 */

const ease = [0.2, 0, 0, 1] as const;

export const containerVariants: Variants = {
  offscreen: { opacity: 0, y: 12 },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease,
      delayChildren: 0.1,
      staggerChildren: 0.08,
    },
  },
};

export const childVariants: Variants = {
  offscreen: { opacity: 0, y: 12 },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease },
  },
};

/** Fondu-and-rise used by sections that have no staggered children. */
export const fadeUpVariants: Variants = {
  offscreen: { opacity: 0, y: 12 },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease },
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
  const reducedMotion = useReducedMotion();
  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }
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
  const reducedMotion = useReducedMotion();
  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease, delay }}
    >
      {children}
    </motion.div>
  );
}