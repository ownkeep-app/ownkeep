import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useClearFiltersOnEscape } from "./use-clear-filters-on-escape";

describe("useClearFiltersOnEscape", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("clears when Escape is pressed and filters are active", () => {
    const onClear = vi.fn();
    renderHook(() => useClearFiltersOnEscape(true, onClear));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("does nothing when filters are inactive", () => {
    const onClear = vi.fn();
    renderHook(() => useClearFiltersOnEscape(false, onClear));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClear).not.toHaveBeenCalled();
  });

  it("skips Escape while a modal dialog is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);

    const onClear = vi.fn();
    renderHook(() => useClearFiltersOnEscape(true, onClear));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClear).not.toHaveBeenCalled();
  });

  it("clears even while a category select is focused", () => {
    const select = document.createElement("select");
    document.body.append(select);
    select.focus();

    const onClear = vi.fn();
    renderHook(() => useClearFiltersOnEscape(true, onClear));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(select);
  });

  it("clears even while the search input is focused", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const onClear = vi.fn();
    renderHook(() => useClearFiltersOnEscape(true, onClear));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);
  });
});
