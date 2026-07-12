import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
 */
export function RowActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: RowAction[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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
        size="icon"
        type="button"
        variant="ghost"
      >
        <EllipsisVertical className="h-4 w-4" />
      </Button>
      {open && (
        <ul
          className="absolute right-0 top-full z-30 mt-1 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          id={menuId}
          role="menu"
        >
          {actions.map((action) => (
            <li key={action.label} role="none">
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  action.destructive &&
                    "text-destructive hover:bg-destructive/10 hover:text-destructive",
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
        </ul>
      )}
    </div>
  );
}
