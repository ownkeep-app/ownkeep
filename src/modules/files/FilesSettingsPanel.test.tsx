import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel, setModuleSettings } from "@/vault/model";
import { FilesSettingsPanel } from "./FilesSettingsPanel";

const original = useVaultStore.getState().updateFilesSettings;

describe("FilesSettingsPanel", () => {
  const updateFilesSettings = vi.fn(async () => {});

  beforeEach(() => {
    updateFilesSettings.mockClear();
    useVaultStore.setState({
      model: createDefaultModel("2026-07-08T00:00:00.000Z"),
      updateFilesSettings,
    });
  });

  afterEach(() => {
    useVaultStore.setState({ updateFilesSettings: original });
  });

  const field = () =>
    screen.getByRole("textbox", { name: "Maximum file size (MB)" });

  function commit(value: string) {
    fireEvent.change(field(), { target: { value } });
    fireEvent.blur(field());
  }

  it("defaults to no limit", () => {
    render(<FilesSettingsPanel />);
    expect(field()).toHaveValue("0");
    expect(screen.getByText(/0 means no limit/)).toBeVisible();
  });

  it("shows the stored limit, including when it changes", () => {
    render(<FilesSettingsPanel />);
    const model = useVaultStore.getState().model!;
    fireEvent.change(field(), { target: { value: "draft" } });
    useVaultStore.setState({
      model: setModuleSettings(model, "files", { maxFileSizeMb: 250 }),
    });
    return waitFor(() => expect(field()).toHaveValue("250"));
  });

  it("saves a new limit", async () => {
    render(<FilesSettingsPanel />);
    commit("500");
    await waitFor(() =>
      expect(updateFilesSettings).toHaveBeenCalledWith({ maxFileSizeMb: 500 }),
    );
  });

  it("doesn't save when nothing changed, and normalizes blank to 0", () => {
    render(<FilesSettingsPanel />);
    commit("0");
    commit("  ");
    expect(updateFilesSettings).not.toHaveBeenCalled();
    expect(field()).toHaveValue("0");
  });

  it("refuses anything but a whole number, then recovers", async () => {
    render(<FilesSettingsPanel />);
    commit("1.5");
    expect(screen.getByRole("alert")).toHaveTextContent(/whole number/);
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(updateFilesSettings).not.toHaveBeenCalled();

    commit("2");
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() =>
      expect(updateFilesSettings).toHaveBeenCalledWith({ maxFileSizeMb: 2 }),
    );
  });

  it("copes with no model loaded", () => {
    useVaultStore.setState({ model: null });
    render(<FilesSettingsPanel />);
    expect(field()).toHaveValue("0");
  });
});
