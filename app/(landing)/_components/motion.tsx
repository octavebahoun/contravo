'use client';

import {
  motion,
  useInView,
  useReducedMotion,
  useSpring,
  useTransform,
  useScroll,
  animate,
  AnimatePresence,
  type Variants,
} from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Vocabulaire de mouvement de la landing.
 *
 * Un seul easing et trois durées pour toute la page : c'est ce qui fait qu'un
 * scroll donne l'impression d'un seul objet qui bouge, et non d'une collection
 * d'animations réglées chacune de son côté. Les entrées restent des fondus
 * accompagnés d'un déplacement court — au-delà de ~24px le regard suit le
 * mouvement au lieu de lire le texte.
 *
 * Le respect de `prefers-reduced-motion` est délégué au `MotionConfig` de la
 * mise en page (`motion-provider.tsx`) : aucun composant ici ne choisit entre
 * deux arbres selon la préférence, sans quoi le rendu serveur — qui ne la
 * connaît pas — divergerait de l'hydratation.
 */

/** Décélération franche puis arrêt net — la courbe « vive mais disciplinée ». */
export const ease = [0.2, 0, 0, 1] as const;

export const duration = {
  /** Micro-retours : survols, rotations d'icône. */
  fast: 0.18,
  /** Entrées de contenu. */
  base: 0.42,
  /** Pièces maîtresses : titre du hero, carte de devis. */
  slow: 0.6,
} as const;

/** Distance d'entrée verticale, en pixels. */
const RISE = 18;

export const containerVariants: Variants = {
  offscreen: { opacity: 0, y: RISE },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.base,
      ease,
      delayChildren: 0.08,
      staggerChildren: 0.09,
    },
  },
};

export const childVariants: Variants = {
  offscreen: { opacity: 0, y: RISE },
  onscreen: { opacity: 1, y: 0, transition: { duration: duration.base, ease } },
};

/** Fondu simple, pour les blocs sans enfants échelonnés. */
export const fadeUpVariants: Variants = {
  offscreen: { opacity: 0, y: RISE },
  onscreen: { opacity: 1, y: 0, transition: { duration: duration.base, ease } },
};

/**
 * Bloc qui entre au scroll. `amount` fixe la part de l'élément qui doit être
 * visible pour déclencher — bas pour les grands blocs, sinon ils n'entrent
 * jamais sur un petit écran.
 */
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

/** Enfant échelonné d'un `Reveal` : il hérite de l'état du parent. */
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

/** Entrée du hero : elle joue au montage, pas au scroll — elle est déjà visible. */
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
      initial={{ opacity: 0, y: RISE }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Survol des cartes : un soulèvement de 3px et rien d'autre.
 *
 * Le `y` est confié à un ressort plutôt qu'à une transition CSS : quand la
 * souris traverse rapidement plusieurs cartes, un ressort reprend le mouvement
 * en cours au lieu de repartir de zéro, et la rangée ne clignote pas.
 */
export function HoverLift({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Chiffre de la bande « preuve » qui monte jusqu'à sa valeur.
 *
 * Seul le préfixe numérique est animé ; le reste de la chaîne (« × », « % »)
 * est réaffiché tel quel, pour que la donnée reste exactement celle du contenu.
 *
 * La valeur finale est rendue dès le serveur : c'est elle qui doit rester
 * lisible si le JavaScript ne s'exécute jamais, et c'est aussi ce qui garantit
 * un HTML identique de part et d'autre de l'hydratation. La remise à zéro se
 * fait dans un effet de mise en page, donc avant le premier affichage — le
 * visiteur ne voit pas le chiffre reculer.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const match = value.match(/^(\d+)(.*)$/);
  const target = match ? Number(match[1]) : null;
  const suffix = match ? match[2] : '';
  const [shown, setShown] = useState(target);

  const willAnimate = target !== null && !reducedMotion;

  useLayoutEffect(() => {
    if (willAnimate) setShown(0);
  }, [willAnimate]);

  useEffect(() => {
    if (!willAnimate || !inView || target === null) return;
    const controls = animate(0, target, {
      duration: duration.slow,
      ease,
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, willAnimate, target]);

  if (target === null) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span ref={ref} className={className}>
      {shown}
      {suffix}
    </span>
  );
}

/**
 * Question de la FAQ.
 *
 * C'est le seul endroit de la page qui anime une hauteur. La charte l'écarte
 * partout ailleurs — une hauteur animée force un recalcul de mise en page à
 * chaque image — mais un dépliant sans transition saute, et le saut déplace
 * tout ce qui suit sans prévenir. La mesure porte sur un seul élément en fin
 * de page, et la durée reste courte.
 */
export function Disclosure({
  question,
  answer,
  defaultOpen = false,
}: {
  question: string;
  answer: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border first:border-t">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left font-heading text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <span>{question}</span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: duration.fast, ease }}
          className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-lg leading-none font-normal text-muted-foreground"
        >
          +
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.fast * 1.4, ease }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Dérive lente de la carte du hero pendant le scroll.
 *
 * Le décalage est lissé par un ressort : lié directement à la position de
 * scroll, il suivrait les à-coups de la molette. Amplitude volontairement
 * faible — au-delà, la carte se désolidarise du texte qu'elle accompagne.
 *
 * La plage part de zéro plutôt que d'être centrée : la carte occupe ainsi sa
 * position naturelle au chargement, ce qui rend le HTML du serveur identique
 * au premier rendu client, préférence de mouvement réduit ou non.
 */
export function ScrollDrift({
  children,
  className,
  distance = 40,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const raw = useTransform(scrollYProgress, (p) => (reducedMotion ? 0 : -p * distance));
  const y = useSpring(raw, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * Vrai/faux « la page a défilé » — sert à poser l'ombre de l'en-tête collant.
 *
 * L'état ne bascule qu'au franchissement du seuil : recalculé à chaque image,
 * un scroll qui oscille autour de 8px ferait clignoter la bordure.
 */
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > threshold;
      setScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return scrolled;
}
