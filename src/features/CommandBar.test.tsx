import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hideWindow } from "@/lib/window";
import {
  PASSWORD_SECRET_FIELD,
  PASSWORDS_MODULE_ID,
} from "@/modules/passwords/types";
import type { FeatureModule } from "@/modules/types";
import { useShellStore } from "@/stores/shell-store";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel, type VaultModel } from "@/vault/model";
import { CommandBar } from "./CommandBar";

vi.mock("@/lib/window", () => ({ hideWindow: vi.fn(async () => {}) }));
vi.mock("@/vault/api", () => ({
  vaultApi: {
    copySecret: vi.fn(async () => {}),
    saveVault: vi.fn(async () => {}),
  },
}));

const mockHideWindow = vi.mocked(hideWindow);
const api = vi.mocked(vaultApi);
const NOW = "2026-07-07T00:00:00.000Z";

function passwordItem(id: string, name: string, username: string) {
  return {
    id,
    name,
    username,
    password: "",
    loginUrl: "",
    recoveryUrl: "",
    notes: "",
    tags: [] as string[],
    updatedAt: NOW,
  };
}

function withPasswords(items: ReturnType<typeof passwordItem>[]): VaultModel {
  const base = createDefaultModel(NOW);
  return {
    ...base,
    settings: { ...base.settings, modules: { passwords: { enabled: true } } },
    modules: { [PASSWORDS_MODULE_ID]: items },
  };
}

function setModel(model: VaultModel | null) {
  useVaultStore.setState({ model });
}

describe("CommandBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShellStore.setState({ query: "" });
    setModel(null);
  });

  it("keeps the query in the shell store", async () => {
    const user = userEvent.setup();
    render(<CommandBar />);

    await user.type(screen.getByRole("combobox", { name: /search/i }), "ssh");

    expect(useShellStore.getState().query).toBe("ssh");
  });

  it("hides the launcher on Escape", () => {
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockHideWindow).toHaveBeenCalledTimes(1);
  });

  it("removes its keydown listener when unmounted", () => {
    const { unmount } = render(<CommandBar />);
    unmount();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockHideWindow).not.toHaveBeenCalled();
  });

  it("shows only the input when there is no unlocked model", () => {
    render(<CommandBar />);

    expect(
      screen.getByRole("combobox", { name: /search/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("renders ranked results numbered 1..N", () => {
    setModel(
      withPasswords([
        passwordItem("gh", "GitHub", "shao"),
        passwordItem("aws", "AWS", "root"),
      ]),
    );
    render(<CommandBar />);

    expect(screen.getByText("GitHub - shao")).toBeInTheDocument();
    expect(screen.getByText("AWS - root")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("copies the numbered result's secret and records the use", async () => {
    setModel(withPasswords([passwordItem("gh", "GitHub", "shao")]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() =>
      expect(api.copySecret).toHaveBeenCalledWith("gh", PASSWORD_SECRET_FIELD),
    );
    expect(api.saveVault).toHaveBeenCalled(); // frecency bump persisted
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("runs the primary action when a result is selected", async () => {
    const user = userEvent.setup();
    setModel(withPasswords([passwordItem("gh", "GitHub", "shao")]));
    render(<CommandBar />);

    await user.click(screen.getByRole("option", { name: /github/i }));

    await waitFor(() =>
      expect(api.copySecret).toHaveBeenCalledWith("gh", PASSWORD_SECRET_FIELD),
    );
  });

  it("ignores a numbered hotkey with no matching result", () => {
    setModel(withPasswords([passwordItem("gh", "GitHub", "shao")]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "5", metaKey: true });

    expect(api.copySecret).not.toHaveBeenCalled();
  });

  it("records use without copying for a module that declares no secret field", async () => {
    const notesModule: FeatureModule = {
      id: "notes",
      title: "Notes",
      icon: null,
      enabledByDefault: true,
      scopePrefix: "n",
      createEmpty: () => [],
      buildIndex: () => [
        {
          id: "n1",
          moduleId: "notes",
          type: "note",
          searchString: "hello",
          displayLine: "Hello note",
        },
      ],
      ListView: () => null,
    };
    const base = createDefaultModel(NOW);
    setModel({
      ...base,
      settings: { ...base.settings, modules: { notes: { enabled: true } } },
      modules: { notes: [] },
    });
    render(<CommandBar modules={[notesModule]} />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() => expect(api.saveVault).toHaveBeenCalled());
    expect(api.copySecret).not.toHaveBeenCalled();
  });
});
