import type { Transition } from "motion/react";

/**
 * Shared Motion presets for Phase 11 polish. Keep animations short and calm (spec §10 /
 * §6/F11) so they never compete with the <30 ms keystroke-to-results budget.
 */

export const TAP_SCALE = 0.97;

/** Soft press feedback for buttons / sidebar rows. */
export const tapTransition: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 32,
  mass: 0.4,
};

/** Switch thumb / toggles. */
export const switchThumbTransition: Transition = {
  type: "spring",
  stiffness: 700,
  damping: 38,
};

/** Enter / exit fades for overlays and empty states. */
export const fadeTransition: Transition = {
  duration: 0.15,
  ease: "easeOut",
};

export const dialogTransition: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
};

/** Stagger upstairs for command-bar / list results — tiny so typing stays snappy. */
export const listStagger = {
  animate: {
    transition: { staggerChildren: 0.02, delayChildren: 0.01 },
  },
};

export const listItem = {
  initial: { opacity: 0, y: 4 },
  animate: {
    opacity: 1,
    y: 0,
    transition: fadeTransition,
  },
};

/**
 * Returns `undefined` when the user prefers reduced motion so Motion skips gesture /
 * spring animation props. Always keep opacity bursts shorter when they still run.
 */
export function motionOrUndefined<T>(
  reduce: boolean | null,
  value: T,
): T | undefined {
  return reduce ? undefined : value;
}
