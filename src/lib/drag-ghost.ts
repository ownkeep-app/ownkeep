import { MOVE_EASING, MOVE_MS, prefersReducedMotion } from "./flip";

const GHOST_OPACITY = "0.9";
const GHOST_SHADOW = "0 12px 28px rgb(0 0 0 / 0.35)";
const GHOST_Z_INDEX = "80";

export interface DragGhost {
  /** Follow the pointer, by the distance it has moved since the drag began. */
  moveBy: (dx: number, dy: number) => void;
  /** Glide over `rect`, then call `onLanded` (at once if the user prefers reduced motion). */
  landOn: (rect: DOMRect, onLanded: () => void) => void;
  remove: () => void;
}

/**
 * Previews must not load again just because they're being dragged: each load decrypts the file. A
 * video keeps the frame on screen.
 */
function replaceVideos(original: HTMLElement, clone: HTMLElement) {
  const originals = original.querySelectorAll("video");
  clone.querySelectorAll("video").forEach((video, index) => {
    const frame = document.createElement("canvas");
    frame.className = video.className;
    frame.width = originals[index].videoWidth;
    frame.height = originals[index].videoHeight;
    frame.getContext("2d")?.drawImage(originals[index], 0, 0);
    video.replaceWith(frame);
  });
}

/** A floating copy of `item` that follows the pointer during a drag and glides into place on drop. */
export function createDragGhost(item: HTMLElement): DragGhost {
  const origin = item.getBoundingClientRect();
  const ghost = item.cloneNode(true) as HTMLElement;
  replaceVideos(item, ghost);

  ghost.removeAttribute("data-sort-id");
  ghost.setAttribute("data-drag-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${origin.left}px`,
    top: `${origin.top}px`,
    width: `${origin.width}px`,
    height: `${origin.height}px`,
    margin: "0",
    opacity: GHOST_OPACITY,
    boxShadow: GHOST_SHADOW,
    zIndex: GHOST_Z_INDEX,
    // Lets the drag see what's underneath the copy.
    pointerEvents: "none",
  });
  document.body.appendChild(ghost);

  const place = (dx: number, dy: number) => {
    ghost.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  let landing: ReturnType<typeof setTimeout> | undefined;

  return {
    moveBy: place,
    landOn(rect, onLanded) {
      if (prefersReducedMotion()) {
        onLanded();
        return;
      }
      ghost.style.transition = `transform ${MOVE_MS}ms ${MOVE_EASING}`;
      place(rect.left - origin.left, rect.top - origin.top);
      landing = setTimeout(onLanded, MOVE_MS);
    },
    remove() {
      clearTimeout(landing);
      ghost.remove();
    },
  };
}
