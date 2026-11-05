import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDragSort } from "./use-drag-sort";

const ids = ["a", "b", "c"];
const ITEM_HEIGHT = 100;
const GAP = 20;
const LIST_BOTTOM = 800;

function List({
  onMove,
  peers = ids,
}: {
  onMove: (active: string, over: string) => void;
  peers?: string[];
}) {
  const sort = useDragSort(onMove);
  return (
    <ul data-testid="list">
      {ids.map((id) => (
        <li data-testid={`item-${id}`} key={id} {...sort.itemProps(id)}>
          <button {...sort.handleProps(id, peers)}>handle {id}</button>
        </li>
      ))}
    </ul>
  );
}

const handle = (id: string) =>
  screen.getByRole("button", { name: `handle ${id}` });
/** The list's own item, not the floating copy made of it (which comes later in the document). */
const item = (id: string) => screen.getAllByTestId(`item-${id}`)[0];
const copy = () => document.querySelector<HTMLElement>("[data-drag-ghost]");
const rect = (left: number, top: number, right: number, bottom: number) =>
  ({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }) as DOMRect;

/** Lays the items out in a column, 100 tall with 20 between, in a list that runs to y=800. */
function layOut() {
  ids.forEach((id, index) => {
    const top = index * (ITEM_HEIGHT + GAP);
    item(id).getBoundingClientRect = () => rect(0, top, 300, top + ITEM_HEIGHT);
  });
  screen.getByTestId("list").getBoundingClientRect = () =>
    rect(0, 0, 300, LIST_BOTTOM);
}

const centreOf = (id: string) => {
  const { top, bottom } = item(id).getBoundingClientRect();
  return (top + bottom) / 2;
};

function press(id: string, clientY = centreOf(id)) {
  fireEvent.pointerDown(handle(id), {
    button: 0,
    clientX: 10,
    clientY,
    pointerId: 1,
  });
}

function moveTo(id: string, clientY: number, clientX = 10) {
  fireEvent.pointerMove(handle(id), { clientX, clientY, pointerId: 1 });
}

function release(id: string) {
  fireEvent.pointerUp(handle(id), { pointerId: 1 });
}

const settle = () => act(() => vi.runAllTimers());

describe("useDragSort", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("floats a copy that follows the pointer, only once the pointer moves", () => {
    render(<List onMove={vi.fn()} />);
    layOut();

    press("a", 50);
    expect(copy()).toBeNull();

    moveTo("a", 40, 40);
    expect(copy()).toHaveTextContent("handle a");
    expect(copy()!.style.transform).toBe("translate(30px, -10px)");

    moveTo("a", 45, 60);
    expect(document.querySelectorAll("[data-drag-ghost]")).toHaveLength(1);
    expect(copy()!.style.transform).toBe("translate(50px, -5px)");
  });

  it("clicking a handle without moving leaves no trace", () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} />);
    layOut();

    press("a");
    expect(item("a")).toHaveAttribute("data-dragging", "true");
    release("a");

    expect(item("a")).toHaveAttribute("data-dragging", "false");
    expect(copy()).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("marks the drag and its target as it goes", () => {
    render(<List onMove={vi.fn()} />);
    layOut();

    press("a");
    moveTo("a", centreOf("c"));

    expect(item("a")).toHaveAttribute("data-dragging", "true");
    expect(item("c")).toHaveAttribute("data-drop-target", "true");
  });

  describe("where a release counts", () => {
    it.each([
      ["exactly on an item", 270, "c"],
      ["in the gap between two items", 225, "b"],
      ["in the empty space below the last item", 700, "c"],
    ])("moves when released %s", (_label, clientY, target) => {
      const onMove = vi.fn();
      render(<List onMove={onMove} />);
      layOut();

      press("a");
      moveTo("a", clientY);
      release("a");

      expect(onMove).toHaveBeenCalledWith("a", target);
    });

    it("treats anywhere below a grid as the end, even under the item's own column", () => {
      const onMove = vi.fn();
      render(<List onMove={onMove} />);
      ids.forEach((id, index) => {
        const left = index * 120;
        item(id).getBoundingClientRect = () => rect(left, 0, left + 100, 100);
      });
      screen.getByTestId("list").getBoundingClientRect = () =>
        rect(0, 0, 400, LIST_BOTTOM);

      press("a", 50);
      moveTo("a", 300, 50);
      release("a");

      expect(onMove).toHaveBeenCalledWith("a", "c");
    });

    it("moves to the nearest item when off to the side of the column", () => {
      const onMove = vi.fn();
      render(<List onMove={onMove} />);
      layOut();
      screen.getByTestId("list").getBoundingClientRect = () =>
        rect(0, 0, 900, LIST_BOTTOM);

      press("a");
      moveTo("a", centreOf("c"), 800);
      release("a");

      expect(onMove).toHaveBeenCalledWith("a", "c");
    });

    it.each([
      ["above the list", -10, 10],
      ["below the list", LIST_BOTTOM + 1, 10],
      ["left of the list", 50, -10],
      ["right of the list", 50, 301],
    ])("cancels when released %s, gliding home", (_label, clientY, clientX) => {
      const onMove = vi.fn();
      render(<List onMove={onMove} />);
      layOut();

      press("a", 50);
      moveTo("a", clientY, clientX);
      expect(item("b")).toHaveAttribute("data-drop-target", "false");
      release("a");

      expect(copy()!.style.transform).toBe("translate(0px, 0px)");
      settle();
      expect(onMove).not.toHaveBeenCalled();
      expect(copy()).toBeNull();
      expect(item("a")).toHaveAttribute("data-dragging", "false");
    });

    it("does nothing when its own place is the nearest", () => {
      const onMove = vi.fn();
      render(<List onMove={onMove} />);
      layOut();

      press("b");
      moveTo("b", centreOf("b") + 10);
      release("b");
      settle();

      expect(onMove).not.toHaveBeenCalled();
    });

    it("refuses an item outside its peers", () => {
      const onMove = vi.fn();
      render(<List onMove={onMove} peers={["a", "b"]} />);
      layOut();

      press("a");
      moveTo("a", centreOf("c"));
      expect(item("c")).toHaveAttribute("data-drop-target", "false");
      release("a");
      settle();

      expect(onMove).not.toHaveBeenCalled();
    });
  });

  describe("reordering", () => {
    /** A list that really reorders, as the app's do when its store changes. */
    function SortedList({ onMove }: { onMove: () => void }) {
      const [order, setOrder] = useState(ids);
      const sort = useDragSort((active, over) => {
        onMove();
        setOrder((current) => {
          const next = current.filter((id) => id !== active);
          next.splice(current.indexOf(over), 0, active);
          return next;
        });
      });
      return (
        <ul data-testid="list">
          {order.map((id) => (
            <li data-testid={`item-${id}`} key={id} {...sort.itemProps(id)}>
              <button {...sort.handleProps(id, order)}>handle {id}</button>
            </li>
          ))}
        </ul>
      );
    }

    /** Each item's position follows its place in the DOM, like a real column. */
    function layOutLive() {
      const list = screen.getByTestId("list");
      list.getBoundingClientRect = () => rect(0, 0, 300, LIST_BOTTOM);
      for (const id of ids) {
        const element = item(id);
        element.getBoundingClientRect = () => {
          const index = [...list.children].indexOf(element);
          const top = index * (ITEM_HEIGHT + GAP);
          return rect(0, top, 300, top + ITEM_HEIGHT);
        };
        element.animate = vi.fn();
      }
    }

    const order = () =>
      [...screen.getByTestId("list").children].map((row) =>
        row.getAttribute("data-sort-id"),
      );

    it("reorders on release, sliding the others while the copy glides to the new slot", () => {
      const onMove = vi.fn();
      render(<SortedList onMove={onMove} />);
      layOutLive();

      press("a", 50);
      moveTo("a", centreOf("c"));
      release("a");

      // Reordered straight away, not after the glide.
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(order()).toEqual(["b", "c", "a"]);

      expect(item("b").animate).toHaveBeenCalledTimes(1);
      expect(item("c").animate).toHaveBeenCalledTimes(1);
      expect(item("a").animate).not.toHaveBeenCalled();
      expect(copy()!.style.transform).toBe("translate(0px, 240px)");
      expect(item("a")).toHaveAttribute("data-dragging", "true");

      settle();
      expect(copy()).toBeNull();
      expect(item("a")).toHaveAttribute("data-dragging", "false");
    });

    it("ignores the pointer wandering while the copy lands", () => {
      const onMove = vi.fn();
      render(<SortedList onMove={onMove} />);
      layOutLive();

      press("a", 50);
      moveTo("a", centreOf("c"));
      release("a");
      const landed = copy()!.style.transform;

      moveTo("a", 5, 5);
      release("a");

      expect(copy()!.style.transform).toBe(landed);
      expect(onMove).toHaveBeenCalledTimes(1);
    });

    it("slides the item itself too when moved by arrow key", () => {
      render(<SortedList onMove={vi.fn()} />);
      layOutLive();

      fireEvent.keyDown(handle("a"), { key: "ArrowDown" });

      expect(order()).toEqual(["b", "a", "c"]);
      expect(item("a").animate).toHaveBeenCalledTimes(1);
      expect(item("b").animate).toHaveBeenCalledTimes(1);
      expect(item("c").animate).not.toHaveBeenCalled();
    });
  });

  it("ignores a second drag while one is under way", () => {
    render(<List onMove={vi.fn()} />);
    layOut();

    press("a");
    moveTo("a", 5);
    fireEvent.pointerDown(handle("b"), { button: 0, pointerId: 2 });

    expect(item("b")).toHaveAttribute("data-dragging", "false");
    expect(item("a")).toHaveAttribute("data-dragging", "true");
  });

  it("removes the copy if the list goes away mid-drag", () => {
    const view = render(<List onMove={vi.fn()} />);
    layOut();

    press("a");
    moveTo("a", 5);
    expect(copy()).not.toBeNull();

    view.unmount();
    expect(copy()).toBeNull();
  });

  it("forgets the drag on cancel", () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} />);
    layOut();

    press("a");
    moveTo("a", centreOf("c"));
    fireEvent.pointerCancel(handle("a"), { pointerId: 1 });
    expect(copy()).toBeNull();
    release("a");
    settle();

    expect(onMove).not.toHaveBeenCalled();
    expect(item("a")).toHaveAttribute("data-dragging", "false");
  });

  it("ignores a secondary button, and moving or releasing without a drag", () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} />);
    layOut();

    fireEvent.pointerDown(handle("a"), { button: 2, pointerId: 1 });
    expect(item("a")).toHaveAttribute("data-dragging", "false");

    moveTo("a", centreOf("c"));
    expect(item("c")).toHaveAttribute("data-drop-target", "false");
    release("a");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("moves one place with arrow keys, stopping at the ends", () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} />);

    fireEvent.keyDown(handle("b"), { key: "ArrowDown" });
    expect(onMove).toHaveBeenLastCalledWith("b", "c");
    fireEvent.keyDown(handle("b"), { key: "ArrowRight" });
    expect(onMove).toHaveBeenLastCalledWith("b", "c");
    fireEvent.keyDown(handle("b"), { key: "ArrowUp" });
    expect(onMove).toHaveBeenLastCalledWith("b", "a");
    fireEvent.keyDown(handle("b"), { key: "ArrowLeft" });
    expect(onMove).toHaveBeenLastCalledWith("b", "a");
    onMove.mockClear();

    fireEvent.keyDown(handle("a"), { key: "ArrowUp" });
    fireEvent.keyDown(handle("c"), { key: "ArrowDown" });
    fireEvent.keyDown(handle("a"), { key: "Enter" });
    expect(onMove).not.toHaveBeenCalled();
  });

  describe("scrolling while dragging", () => {
    function scrollingList() {
      const view = render(
        <div data-testid="scroller" style={{ overflowY: "auto" }}>
          <List onMove={vi.fn()} />
        </div>,
      );
      layOut();
      const scroller = screen.getByTestId("scroller");
      Object.defineProperty(scroller, "scrollHeight", { value: 1000 });
      Object.defineProperty(scroller, "clientHeight", { value: 300 });
      scroller.getBoundingClientRect = () => rect(0, 100, 300, 400);
      scroller.scrollBy = vi.fn() as typeof scroller.scrollBy;
      press("a");
      return { ...view, scroller };
    }

    it("scrolls up and down near the edges, and not in the middle", () => {
      const { scroller } = scrollingList();

      moveTo("a", 110);
      expect(scroller.scrollBy).toHaveBeenLastCalledWith(0, -24);
      moveTo("a", 390);
      expect(scroller.scrollBy).toHaveBeenLastCalledWith(0, 24);
      vi.mocked(scroller.scrollBy).mockClear();
      moveTo("a", 250);
      expect(scroller.scrollBy).not.toHaveBeenCalled();
    });

    it("skips ancestors that overflow but don't scroll", () => {
      const { scroller } = scrollingList();
      scroller.style.overflowY = "hidden";
      moveTo("a", 110);
      expect(scroller.scrollBy).not.toHaveBeenCalled();
    });
  });
});
