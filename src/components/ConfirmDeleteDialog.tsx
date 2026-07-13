import { useEffect, useRef } from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  modalOverlayClassName,
  modalPanelClassName,
} from "@/components/modal-styles";
import { Button } from "@/components/ui/button";
import { fadeTransition, motionOrUndefined } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Shared delete confirmation for Dashboard item deletes (spec §7).
 * Cancel / Esc / backdrop dismiss; Delete runs the destructive action.
 */
export function ConfirmDeleteDialog({
  open,
  itemName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Display name of the item being deleted (shown in the title). */
  itemName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(modalOverlayClassName, "z-[60]")}
          initial={false}
          animate={{ opacity: 1 }}
          exit={motionOrUndefined(reduce, { opacity: 0 })}
          transition={fadeTransition}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onCancel();
            }
          }}
          role="presentation"
        >
          <button
            aria-label="Dismiss delete confirmation"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={onCancel}
            tabIndex={-1}
            type="button"
          />
          <section
            aria-describedby="confirm-delete-description"
            aria-labelledby="confirm-delete-title"
            aria-modal="true"
            className={cn(modalPanelClassName, "w-full max-w-md p-5")}
            role="alertdialog"
          >
            <h2 className="text-base font-semibold" id="confirm-delete-title">
              Delete “{itemName}”?
            </h2>
            <p
              className="mt-2 text-sm text-muted-foreground"
              id="confirm-delete-description"
            >
              This cannot be undone.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                onClick={onCancel}
                ref={cancelRef}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button onClick={onConfirm} type="button" variant="destructive">
                Delete
              </Button>
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
