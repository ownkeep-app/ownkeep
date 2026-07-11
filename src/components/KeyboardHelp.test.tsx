import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { KeyboardHelp } from "./KeyboardHelp";
import {
  COMMAND_BAR_SHORTCUTS,
  DASHBOARD_SHORTCUTS,
  GLOBAL_SHORTCUTS,
} from "./keyboard-shortcuts";

describe("KeyboardHelp", () => {
  it("opens the cheat sheet from the trigger and lists shortcuts", async () => {
    const user = userEvent.setup();
    render(<KeyboardHelp groups={[COMMAND_BAR_SHORTCUTS, GLOBAL_SHORTCUTS]} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Keyboard shortcuts" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Command bar")).toBeInTheDocument();
    expect(
      screen.getByText("Run a result's primary action"),
    ).toBeInTheDocument();
    expect(screen.getByText("Summon the command bar")).toBeInTheDocument();
  });

  it("toggles with Cmd+H", async () => {
    render(<KeyboardHelp groups={[DASHBOARD_SHORTCUTS]} />);

    fireEvent.keyDown(window, { key: "h", metaKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "h", metaKey: true });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("can be opened via Ctrl+H even without a trigger button", () => {
    render(<KeyboardHelp groups={[GLOBAL_SHORTCUTS]} showTrigger={false} />);

    expect(
      screen.queryByRole("button", { name: "Keyboard shortcuts" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "h", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape without leaking the key to the surface below", async () => {
    const user = userEvent.setup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    render(<KeyboardHelp groups={[COMMAND_BAR_SHORTCUTS]} />);

    await user.click(
      screen.getByRole("button", { name: "Keyboard shortcuts" }),
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("ignores non-Escape keys inside the overlay", async () => {
    const user = userEvent.setup();
    render(<KeyboardHelp groups={[COMMAND_BAR_SHORTCUTS]} />);

    await user.click(
      screen.getByRole("button", { name: "Keyboard shortcuts" }),
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "a" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<KeyboardHelp groups={[COMMAND_BAR_SHORTCUTS]} />);

    await user.click(
      screen.getByRole("button", { name: "Keyboard shortcuts" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Dismiss keyboard shortcuts" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes from the header close button", async () => {
    const user = userEvent.setup();
    render(<KeyboardHelp groups={[COMMAND_BAR_SHORTCUTS]} />);

    await user.click(
      screen.getByRole("button", { name: "Keyboard shortcuts" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Close keyboard shortcuts" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("supports controlled open state from a parent surface", async () => {
    const onOpenChange = vi.fn();

    function ControlledHarness() {
      const [open, setOpen] = useState(true);
      return (
        <KeyboardHelp
          groups={[DASHBOARD_SHORTCUTS]}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
          open={open}
          showTrigger={false}
        />
      );
    }

    render(<ControlledHarness />);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.keyDown(window, { key: "h", metaKey: true });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
