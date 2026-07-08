import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeClipboard } from "@/lib/clipboard";
import { hideWindow } from "@/lib/window";
import {
  COMMANDS_MODULE_ID,
  type CommandEntry,
} from "@/modules/commands/types";
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
vi.mock("@/lib/clipboard", () => ({ writeClipboard: vi.fn(async () => true) }));
vi.mock("@/vault/api", () => ({
  vaultApi: {
    copySecret: vi.fn(async () => {}),
    saveVault: vi.fn(async () => {}),
  },
}));

const mockHideWindow = vi.mocked(hideWindow);
const clip = vi.mocked(writeClipboard);
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

function command(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id: "run",
    category: "docker",
    title: "Run",
    description: "",
    snippets: [],
    primaryCopyTemplate: "docker run {{img}}",
    arguments: [],
    tags: [],
    updatedAt: NOW,
    ...overrides,
  };
}

function withCommands(items: CommandEntry[]): VaultModel {
  const base = createDefaultModel(NOW);
  return {
    ...base,
    settings: { ...base.settings, modules: { commands: { enabled: true } } },
    modules: { [COMMANDS_MODULE_ID]: items },
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

  it("copies a placeholder-free command immediately", async () => {
    setModel(withCommands([command({ primaryCopyTemplate: "git status" })]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() => expect(clip).toHaveBeenCalledWith("git status"));
    expect(api.saveVault).toHaveBeenCalled(); // frecency recorded
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("opens the inline fill-in for a command with placeholders", async () => {
    setModel(withCommands([command()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    expect(await screen.findByLabelText("img")).toBeInTheDocument();
    expect(clip).not.toHaveBeenCalled(); // nothing copied until the form is submitted
  });

  it("copies the completed command from the fill-in", async () => {
    const user = userEvent.setup();
    setModel(withCommands([command()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });
    await user.type(await screen.findByLabelText("img"), "nginx");
    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    await waitFor(() => expect(clip).toHaveBeenCalledWith("docker run nginx"));
  });

  it("cancels the fill-in on Escape without hiding the launcher", async () => {
    setModel(withCommands([command()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });
    await screen.findByLabelText("img");
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByLabelText("img")).not.toBeInTheDocument(),
    );
    expect(mockHideWindow).not.toHaveBeenCalled();
  });

  it("copies a command's raw template via Opt+Cmd+<n>", async () => {
    setModel(withCommands([command()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true, altKey: true });

    await waitFor(() =>
      expect(clip).toHaveBeenCalledWith("docker run {{img}}"),
    );
  });

  it("copies raw from within the fill-in form", async () => {
    const user = userEvent.setup();
    setModel(withCommands([command()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });
    await screen.findByLabelText("img");
    await user.click(screen.getByRole("button", { name: /copy raw/i }));

    await waitFor(() =>
      expect(clip).toHaveBeenCalledWith("docker run {{img}}"),
    );
  });

  it("cancels the fill-in via its Cancel button", async () => {
    const user = userEvent.setup();
    setModel(withCommands([command()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });
    await screen.findByLabelText("img");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText("img")).not.toBeInTheDocument(),
    );
    expect(clip).not.toHaveBeenCalled();
  });
});
