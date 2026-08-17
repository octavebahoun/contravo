'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Réglage du mouvement pour toute la landing.
 *
 * `reducedMotion="user"` laisse motion neutraliser lui-même déplacements,
 * rotations et changements d'échelle quand le système le demande, tout en
 * conservant les fondus — c'est le mouvement, pas la variation d'opacité, qui
 * gêne les personnes sensibles.
 *
 * Le faire ici plutôt que composant par composant n'est pas qu'une question de
 * concision : tester `useReducedMotion()` au rendu pour choisir entre deux
 * arbres différents produisait une divergence d'hydratation, le serveur ne
 * connaissant pas la préférence du visiteur. L'arbre est désormais le même des
 * deux côtés, et seules les valeurs d'animation changent.
 */
export function LandingMotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
