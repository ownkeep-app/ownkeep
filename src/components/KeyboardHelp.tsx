import { useEffect, useRef, useState } from "react";

import { Keyboard, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import type { ShortcutGroup } from "@/components/keyboard-shortcuts";
import {
  modalOverlayClassName,
  modalPanelClassName,
} from "@/components/modal-styles";
import {
  dialogTransition,
  fadeTransition,
  motionOrUndefined,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A keyboard-shortcut cheat sheet (spec §10 lists the key maps; Phase 11 surfaces them in-app).
 * Toggle with ⌘/ (works even while a search input is focused). The overlay owns its Escape/⌘/
 * handling and stops those keys from reaching the surface below so closing help never also hides
 * the launcher.
 */
export function KeyboardHelp({
  groups,
  showTrigger = true,
  open: controlledOpen,
  onOpenChange,
}: {
  groups: ShortcutGroup[];
  showTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(next: boolean) {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  }
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        if (onOpenChange) onOpenChange(!open);
        else setInternalOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <>
      {showTrigger && (
        <Button
          aria-label="Keyboard shortcuts"
          className="fixed bottom-3 right-3 z-40"
          onClick={() => setOpen(true)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            className={modalOverlayClassName}
            initial={motionOrUndefined(reduce, { opacity: 0 })}
            animate={{ opacity: 1 }}
            exit={motionOrUndefined(reduce, { opacity: 0 })}
            transition={fadeTransition}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
              }
            }}
            role="presentation"
          >
            <button
              aria-label="Dismiss keyboard shortcuts"
              className="absolute inset-0 h-full w-full cursor-default"
              onClick={() => setOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <motion.section
              aria-label="Keyboard shortcuts"
              aria-modal="true"
              className={cn(modalPanelClassName, "w-full max-w-md p-5")}
              role="dialog"
              initial={motionOrUndefined(reduce, {
                opacity: 0,
                scale: 0.96,
                y: 8,
              })}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={motionOrUndefined(reduce, {
                opacity: 0,
                scale: 0.98,
                y: 4,
              })}
              transition={dialogTransition}
            >
              <header className="mb-4 flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="flex-1 text-sm font-semibold">
                  Keyboard shortcuts
                </h2>
                <Button
                  aria-label="Close keyboard shortcuts"
                  onClick={() => setOpen(false)}
                  ref={closeRef}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </header>
              <div className="flex flex-col gap-4">
                {groups.map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      {group.title}
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {group.shortcuts.map((shortcut) => (
                        <li
                          className="flex items-center justify-between gap-4 text-sm"
                          key={shortcut.label}
                        >
                          <span className="text-muted-foreground">
                            {shortcut.label}
                          </span>
                          <span className="flex shrink-0 gap-1">
                            {shortcut.keys.map((key, index) => (
                              <kbd
                                className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium"
                                key={`${shortcut.label}-${index}`}
                              >
                                {key}
                              </kbd>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
