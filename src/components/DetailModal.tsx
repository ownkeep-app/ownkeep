import { type ReactNode, useEffect, useRef } from "react";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { fadeTransition, motionOrUndefined } from "@/lib/motion";

export function DetailModal({
  open,
  title,
  onClose,
  children,
  actions,
  ariaLabel,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  ariaLabel?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
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
            aria-label={ariaLabel ?? title}
            aria-modal="true"
            className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col rounded-lg border border-border bg-card text-card-foreground shadow-lg"
            role="dialog"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                {title}
              </h2>
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
              <footer className="flex shrink-0 flex-wrap gap-2 border-t border-border px-5 py-4">
                {actions}
              </footer>
            )}
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
