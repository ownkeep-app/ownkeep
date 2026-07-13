import { useEffect, useRef } from "react";

/**
 * When list filters are active, Escape clears them — unless a dialog or open
 * menu already owns the key (search / category focus still clears).
 */
export function useClearFiltersOnEscape(
  filtersActive: boolean,
  onClear: () => void,
) {
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  useEffect(() => {
    if (!filtersActive) return;

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing
      ) {
        return;
      }
      if (
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [role="alertdialog"]',
        )
      ) {
        return;
      }
      if (
        document.querySelector(
          '[role="menu"], [aria-haspopup="menu"][aria-expanded="true"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active instanceof HTMLInputElement ||
          active instanceof HTMLSelectElement ||
          active instanceof HTMLTextAreaElement)
      ) {
        active.blur();
      }
      onClearRef.current();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtersActive]);
}
