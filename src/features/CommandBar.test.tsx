import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard, toastError, toastSecretCopied } from "@/lib/toast";
import { hideWindow } from "@/lib/window";
import {
  COMMANDS_MODULE_ID,
  type CommandEntry,
} from "@/modules/commands/types";
import {
  PASSWORD_SECRET_FIELD,
  PASSWORDS_MODULE_ID,
} from "@/modules/passwords/types";
import {
  SUBSCRIPTIONS_MODULE_ID,
  type SubscriptionEntry,
} from "@/modules/subscriptions/types";
import { TODOS_MODULE_ID, type TodoEntry } from "@/modules/todos/types";
import type { FeatureModule } from "@/modules/types";
import { useShellStore } from "@/stores/shell-store";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel, type VaultModel } from "@/vault/model";
import { CommandBar } from "./CommandBar";

vi.mock("@/lib/window", () => ({ hideWindow: vi.fn(async () => {}) }));
vi.mock("@/lib/clipboard", () => ({ writeClipboard: vi.fn(async () => true) }));
vi.mock("@/lib/toast", () => ({
  toastSecretCopied: vi.fn(),
  toastError: vi.fn(),
  toastClipboard: vi.fn(),
}));
vi.mock("@/vault/api", () => ({
  vaultApi: {
    copySecret: vi.fn(async () => {}),
    saveVault: vi.fn(async () => {}),
    getVault: vi.fn(async () => "{}"),
  },
}));

const mockHideWindow = vi.mocked(hideWindow);
const clip = vi.mocked(writeClipboard);
const secretToast = vi.mocked(toastSecretCopied);
const errorToast = vi.mocked(toastError);
const clipboardToast = vi.mocked(toastClipboard);
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
    category: "Personal",
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

function todo(overrides: Partial<TodoEntry> = {}): TodoEntry {
  return {
    id: "todo-1",
    title: "Renew passport",
    notes: "",
    done: false,
    dueAt: "2026-07-08T12:30:00.000Z",
    notifyLeadMinutes: 30,
    priority: "normal",
    category: "Personal",
    recurrence: "none",
    updatedAt: NOW,
    ...overrides,
  };
}

function withTodos(items: TodoEntry[]): VaultModel {
  const base = createDefaultModel(NOW);
  return {
    ...base,
    settings: { ...base.settings, modules: { todos: { enabled: true } } },
    modules: { [TODOS_MODULE_ID]: items },
  };
}

function subscription(
  overrides: Partial<SubscriptionEntry> = {},
): SubscriptionEntry {
  return {
    id: "sub-1",
    service: "Linode",
    url: "https://cloud.linode.com/account/billing",
    amount: 20,
    currency: "USD",
    cycle: "monthly",
    customIntervalDays: null,
    nextDueDate: "2026-07-10T00:00:00.000Z",
    autoRenew: true,
    notifyLeadDays: 3,
    notes: "",
    category: "Personal",
    tags: [],
    updatedAt: NOW,
    ...overrides,
  };
}

function withSubscriptions(items: SubscriptionEntry[]): VaultModel {
  const base = createDefaultModel(NOW);
  return {
    ...base,
    settings: {
      ...base.settings,
      modules: { subscriptions: { enabled: true } },
    },
    modules: { [SUBSCRIPTIONS_MODULE_ID]: items },
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
    expect(secretToast).toHaveBeenCalled();
    expect(api.saveVault).toHaveBeenCalled(); // frecency bump persisted
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("toasts an error when the secret copy fails but still hides", async () => {
    api.copySecret.mockRejectedValueOnce(new Error("no pasteboard"));
    setModel(withPasswords([passwordItem("gh", "GitHub", "shao")]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith("Couldn't copy the password."),
    );
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("shows a no-results message when the query matches nothing", async () => {
    const user = userEvent.setup();
    setModel(withPasswords([passwordItem("gh", "GitHub", "shao")]));
    render(<CommandBar />);

    await user.type(
      screen.getByRole("combobox", { name: /search/i }),
      "zzz-no-match",
    );

    expect(screen.getByRole("status")).toHaveTextContent(/no matches/i);
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
    expect(clipboardToast).toHaveBeenCalledWith(true, "Command copied");
    expect(api.saveVault).toHaveBeenCalled(); // frecency recorded
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("toggles a todo result as its primary action", async () => {
    setModel(withTodos([todo()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() => expect(api.saveVault).toHaveBeenCalled());
    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.todos[0].done).toBe(true);
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("copies a subscription billing URL as its primary action", async () => {
    setModel(withSubscriptions([subscription()]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() =>
      expect(clip).toHaveBeenCalledWith(
        "https://cloud.linode.com/account/billing",
      ),
    );
    expect(api.saveVault).toHaveBeenCalled(); // frecency recorded
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("records a subscription without a billing URL without copying", async () => {
    setModel(withSubscriptions([subscription({ url: "" })]));
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() => expect(api.saveVault).toHaveBeenCalled());
    expect(clip).not.toHaveBeenCalled();
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
