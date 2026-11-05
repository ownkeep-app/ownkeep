import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { createDragGhost, type DragGhost } from "@/lib/drag-ghost";
import { captureRects, slideFromPrevious } from "@/lib/flip";

const SORT_ID_ATTRIBUTE = "data-sort-id";
const SORT_ITEM_SELECTOR = `[${SORT_ID_ATTRIBUTE}]`;
/** How close to a scrolling list's edge a drag starts scrolling it, and how far each move scrolls. */
const SCROLL_EDGE_PX = 48;
const SCROLL_STEP_PX = 24;
/** Arrow keys on a handle move the item one place, so sorting doesn't require a pointer. */
const KEY_STEPS: Record<string, number> = {
  ArrowUp: -1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowRight: 1,
};

function scrollingAncestor(element: Element): Element | null {
  for (let at = element.parentElement; at; at = at.parentElement) {
    if (at.scrollHeight > at.clientHeight) {
      const { overflowY } = getComputedStyle(at);
      if (overflowY === "auto" || overflowY === "scroll") return at;
    }
  }
  return null;
}

function scrollNearEdge(handle: Element, clientY: number) {
  const list = scrollingAncestor(handle);
  if (!list) return;
  const { top, bottom } = list.getBoundingClientRect();
  if (clientY < top + SCROLL_EDGE_PX) list.scrollBy(0, -SCROLL_STEP_PX);
  else if (clientY > bottom - SCROLL_EDGE_PX) list.scrollBy(0, SCROLL_STEP_PX);
}

function sortItemOf(element: Element): HTMLElement {
  return element.closest<HTMLElement>(SORT_ITEM_SELECTOR)!;
}

function itemsBeside(item: Element): Element[] {
  return [...item.parentElement!.querySelectorAll(SORT_ITEM_SELECTOR)];
}

function squaredDistance(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return dx * dx + dy * dy;
}

/**
 * The item a drop at this point means: the nearest one, anywhere in the list. Requiring the pointer to
 * be exactly over an item made a release in a gap, or in the empty space below the last item, silently
 * do nothing, and those are where people naturally drop. Outside the list means no target.
 */
function nearestItem(source: Element, x: number, y: number): Element | null {
  const list = source.parentElement!.getBoundingClientRect();
  if (x < list.left || x > list.right || y < list.top || y > list.bottom) {
    return null;
  }
  const items = itemsBeside(source);
  // Below everything means "to the end", even if the closest thing in a grid is the item's own column.
  const last = items[items.length - 1];
  if (y > last.getBoundingClientRect().bottom) return last;

  let nearest: Element | null = null;
  let nearestDistance = Infinity;
  for (const item of items) {
    const distance = squaredDistance(item.getBoundingClientRect(), x, y);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * Drag-to-sort for a list or grid. Spread `itemProps` on each item and `handleProps` on its drag handle.
 * A copy of the item follows the pointer while the original stays faded in place. On drop the list
 * reorders at once: the other items slide to their new places as the copy glides into its own.
 *
 * Uses pointer events rather than HTML5 drag and drop, because Tauri's webview intercepts native drags
 * for its own file-drop handling. `peerIds` are the items showing right now, in order: only those accept
 * a drop, and arrow keys step through them.
 */
export function useDragSort(
  onMove: (activeId: string, overId: string) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const ghost = useRef<DragGhost | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const landing = useRef(false);
  /** Set just before a move, for the next commit to animate from. */
  const pendingSlide = useRef<{
    before: Map<Element, DOMRect>;
    item: Element;
  } | null>(null);

  function clearDrag() {
    ghost.current?.remove();
    ghost.current = null;
    landing.current = false;
  }

  function finish() {
    clearDrag();
    setDraggingId(null);
    setOverId(null);
  }

  // Leaving the list mid-drag must not strand the floating copy on screen.
  useEffect(() => clearDrag, []);

  // No dependencies: it has to see the commit that a move caused, and is a no-op otherwise.
  useLayoutEffect(() => {
    const slide = pendingSlide.current;
    if (!slide) return;
    pendingSlide.current = null;
    const dropped = ghost.current;
    slideFromPrevious(slide.before, dropped ? slide.item : undefined);
    dropped?.landOn(slide.item.getBoundingClientRect(), finish);
  });

  function move(id: string, overId: string, item: Element) {
    pendingSlide.current = { before: captureRects(itemsBeside(item)), item };
    onMove(id, overId);
  }

  return {
    itemProps: (id: string) => ({
      [SORT_ID_ATTRIBUTE]: id,
      "data-dragging": draggingId === id,
      "data-drop-target": overId === id,
    }),
    handleProps: (id: string, peerIds: readonly string[]) => ({
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0 || draggingId) return;
        // Stops the drag selecting text on its way across the list.
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        start.current = { x: event.clientX, y: event.clientY };
        setDraggingId(id);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        if (draggingId !== id || landing.current) return;
        const handle = event.currentTarget;
        // Created on the first move, so simply clicking a handle doesn't flash a copy.
        ghost.current ??= createDragGhost(sortItemOf(handle));
        ghost.current.moveBy(
          event.clientX - start.current.x,
          event.clientY - start.current.y,
        );
        scrollNearEdge(handle, event.clientY);

        const item = nearestItem(
          sortItemOf(handle),
          event.clientX,
          event.clientY,
        );
        const target = item?.getAttribute(SORT_ID_ATTRIBUTE);
        setOverId(
          target && target !== id && peerIds.includes(target) ? target : null,
        );
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (draggingId !== id || landing.current) return;
        if (!ghost.current) {
          finish();
          return;
        }
        const source = sortItemOf(event.currentTarget);
        landing.current = true;
        if (overId) {
          setOverId(null);
          move(id, overId, source);
        } else {
          // Not dropped on anything: back home.
          ghost.current.landOn(source.getBoundingClientRect(), finish);
        }
      },
      onPointerCancel: finish,
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        const step = KEY_STEPS[event.key];
        if (!step) return;
        event.preventDefault();
        const neighbour = peerIds[peerIds.indexOf(id) + step];
        if (neighbour) move(id, neighbour, sortItemOf(event.currentTarget));
      },
    }),
  };
}
