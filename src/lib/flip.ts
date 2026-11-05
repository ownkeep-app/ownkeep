/** How long items take to slide when a list reorders, shared with the drag copy so they land together. */
export const MOVE_MS = 180;
export const MOVE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Where each element is now. Call just before the change that will move them. */
export function captureRects(
  elements: Iterable<Element>,
): Map<Element, DOMRect> {
  return new Map(
    [...elements].map((element) => [element, element.getBoundingClientRect()]),
  );
}

/**
 * Once the DOM has changed, start each element from where it was and slide it to where it now is, so a
 * reorder reads as movement rather than a jump. `except` is an element something else is animating.
 */
export function slideFromPrevious(
  previous: Map<Element, DOMRect>,
  except?: Element,
) {
  if (prefersReducedMotion()) return;
  for (const [element, before] of previous) {
    if (element === except) continue;
    const now = element.getBoundingClientRect();
    const dx = before.left - now.left;
    const dy = before.top - now.top;
    if (dx === 0 && dy === 0) continue;
    element.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: MOVE_MS, easing: MOVE_EASING },
    );
  }
}
