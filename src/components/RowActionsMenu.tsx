import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
}

/**
 * Compact row overflow menu: a vertical ellipsis that opens View / Edit / Delete
 * (and module-specific actions) without eating table width.
 *
 * The menu is portaled + fixed so card borders / later list rows cannot cover it.
 */
export function RowActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: RowAction[];
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative flex justify-end" ref={rootRef}>
      <Button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        size="icon"
        type="button"
        variant="ghost"
      >
        <EllipsisVertical className="h-4 w-4" />
      </Button>
      {open &&
        coords &&
        createPortal(
          <ul
            className="fixed z-50 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            id={menuId}
            ref={menuRef}
            role="menu"
            style={{ top: coords.top, right: coords.right }}
          >
            {actions.map((action) => (
              <li key={action.label} role="none">
                <button
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    action.destructive &&
                      "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground",
                  )}
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {action.icon}
                  {action.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
