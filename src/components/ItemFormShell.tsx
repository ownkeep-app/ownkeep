import { type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";

import { modalPanelClassName } from "@/components/modal-styles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared create/edit chrome: dimmed pane + elevated dialog card so the form reads as a
 * special mode, not just another list screen.
 */
export function ItemFormShell({
  title,
  description,
  mode,
  cancelLabel,
  onCancel,
  onSubmit,
  children,
  error,
  bodyClassName,
}: {
  title: string;
  description?: string;
  mode: "create" | "edit";
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  error?: string | null;
  bodyClassName?: string;
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <button
        aria-label="Dismiss form"
        className="absolute inset-0 bg-foreground/15 dark:bg-black/50"
        onClick={onCancel}
        type="button"
      />
      <div className="relative z-10 flex min-h-0 flex-1 justify-center overflow-auto p-4 sm:p-6">
        <form
          aria-label={title}
          aria-modal="true"
          className={cn(
            modalPanelClassName,
            "my-auto flex w-full max-w-3xl flex-col",
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onCancel();
            }
          }}
          onSubmit={onSubmit}
          role="dialog"
          tabIndex={-1}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-6 py-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {mode === "create" ? "Creating" : "Editing"}
              </p>
              <h1 className="text-lg font-semibold">{title}</h1>
              {description ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <Button
              aria-label={cancelLabel}
              onClick={onCancel}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div
            className={cn(
              "grid min-h-0 flex-1 grid-cols-2 content-start items-start gap-4 overflow-auto p-6",
              bodyClassName,
            )}
          >
            {children}
            {error ? (
              <p className="col-span-2 text-sm text-destructive">{error}</p>
            ) : null}
          </div>

          <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
            <Button onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
