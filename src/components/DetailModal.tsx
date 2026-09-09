import { type ReactNode, useEffect, useRef } from "react";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  modalOverlayClassName,
  modalPanelClassName,
} from "@/components/modal-styles";
import { Button } from "@/components/ui/button";
import { fadeTransition, motionOrUndefined } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function DetailModal({
  open,
  title,
  onClose,
  children,
  actions,
  ariaLabel,
  beforeClose,
  titleClassName,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  ariaLabel?: string;
  /** Shown just left of the close button (e.g. updated timestamp). */
  beforeClose?: ReactNode;
  titleClassName?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const label =
    ariaLabel ?? (typeof title === "string" ? title : "Details");

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={modalOverlayClassName}
          initial={false}
          animate={{ opacity: 1 }}
          exit={motionOrUndefined(reduce, { opacity: 0 })}
          transition={fadeTransition}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
          role="presentation"
        >
          <button
            aria-label="Dismiss details"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={onClose}
            tabIndex={-1}
            type="button"
          />
          <section
            aria-label={label}
            aria-modal="true"
            className={cn(
              modalPanelClassName,
              "flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col",
            )}
            role="dialog"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
              <h2
                className={cn(
                  "min-w-0 flex-1 text-sm font-semibold",
                  titleClassName ?? "truncate",
                )}
              >
                {title}
              </h2>
              {beforeClose}
              <Button
                aria-label="Close details"
                onClick={onClose}
                ref={closeRef}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            {actions && (
              <footer className="flex w-full shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-4">
                {actions}
              </footer>
            )}
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
