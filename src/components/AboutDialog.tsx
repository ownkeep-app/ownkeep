import { useEffect, useRef, useState, type ReactNode } from "react";

import { CalendarDays, Globe, Info, Mail, Scale, Tag, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  APP_DEVELOPER_EMAIL,
  APP_FEATURES,
  APP_LICENSE,
  APP_LICENSE_URL,
  APP_RELEASE_DATE,
  APP_WEBSITE,
  aboutVersionLabel,
} from "@/components/about";
import {
  modalOverlayClassName,
  modalPanelClassName,
} from "@/components/modal-styles";
import { Button } from "@/components/ui/button";
import {
  dialogTransition,
  fadeTransition,
  motionOrUndefined,
} from "@/lib/motion";
import { openExternalUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * About OwnKeep dialog (spec §7.5 / §10). Toggle with ⌘/ — same pattern as KeyboardHelp.
 */
export function AboutDialog({
  showTrigger = true,
  open: controlledOpen,
  onOpenChange,
}: {
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
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === "/"
      ) {
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
          aria-label="About OwnKeep"
          className="fixed bottom-3 right-14 z-40"
          onClick={() => setOpen(true)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Info className="h-4 w-4" />
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
              aria-label="Dismiss about OwnKeep"
              className="absolute inset-0 h-full w-full cursor-default"
              onClick={() => setOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <motion.section
              aria-label="About OwnKeep"
              aria-modal="true"
              className={cn(
                modalPanelClassName,
                "flex max-h-[min(90vh,36rem)] w-full max-w-md flex-col overflow-hidden p-0",
              )}
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
              <header className="flex items-center gap-2 px-5 pb-4 pt-5">
                <Info className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="flex-1 text-sm font-semibold">About OwnKeep</h2>
                <Button
                  aria-label="Close about OwnKeep"
                  onClick={() => setOpen(false)}
                  ref={closeRef}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 pb-4 text-sm">
                <p className="text-muted-foreground">
                  An offline-first password vault and command-line library for
                  macOS — one encrypted file, no cloud, no telemetry.
                </p>

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Features
                  </h3>
                  <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
                    {APP_FEATURES.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </section>
              </div>

              <section className="relative border-t border-border bg-muted/70 px-5 py-4 dark:bg-muted/40">
                <DetailsCornerMarks />
                <h3 className="relative z-10 mb-3 text-xs font-medium uppercase text-muted-foreground">
                  Details
                </h3>
                <dl className="relative z-10 grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem
                    icon={
                      <Tag className="size-3.5 text-sky-500 dark:text-sky-400" />
                    }
                    label="Version"
                  >
                    {aboutVersionLabel()}
                  </DetailItem>
                  <DetailItem
                    icon={
                      <CalendarDays className="size-3.5 text-amber-500 dark:text-amber-400" />
                    }
                    label="Release date"
                  >
                    {APP_RELEASE_DATE}
                  </DetailItem>
                  <DetailItem
                    icon={
                      <Mail className="size-3.5 text-rose-500 dark:text-rose-400" />
                    }
                    label="Developer"
                  >
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href={`mailto:${APP_DEVELOPER_EMAIL}`}
                      onClick={(event) => {
                        event.preventDefault();
                        void openExternalUrl(`mailto:${APP_DEVELOPER_EMAIL}`);
                      }}
                    >
                      {APP_DEVELOPER_EMAIL}
                    </a>
                  </DetailItem>
                  <DetailItem
                    icon={
                      <Globe className="size-3.5 text-emerald-500 dark:text-emerald-400" />
                    }
                    label="Website"
                  >
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href={APP_WEBSITE}
                      onClick={(event) => {
                        event.preventDefault();
                        void openExternalUrl(APP_WEBSITE);
                      }}
                      rel="noopener noreferrer"
                    >
                      {APP_WEBSITE}
                    </a>
                  </DetailItem>
                  <DetailItem
                    icon={
                      <Scale className="size-3.5 text-violet-500 dark:text-violet-400" />
                    }
                    label="License"
                  >
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href={APP_LICENSE_URL}
                      onClick={(event) => {
                        event.preventDefault();
                        void openExternalUrl(APP_LICENSE_URL);
                      }}
                      rel="noopener noreferrer"
                    >
                      {APP_LICENSE}
                    </a>
                  </DetailItem>
                </dl>
              </section>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function DetailItem({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden>{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}

/** Light corner accents only — keep the Details band quiet. */
function DetailsCornerMarks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-3">
      <span className="absolute left-0 top-0 h-3.5 w-3.5 border-l-2 border-t-2 border-sky-400/40 dark:border-sky-400/50" />
      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-amber-400/40 dark:border-amber-400/50" />
    </div>
  );
}
