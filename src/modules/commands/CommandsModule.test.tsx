import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import { chooseRowAction, confirmDelete } from "@/test/row-actions";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel } from "@/vault/model";
import {
  CommandDetailView,
  CommandEditView,
  CommandsListView,
} from "./CommandsModule";
import { COMMANDS_MODULE_ID, type CommandEntry } from "./types";

vi.mock("shiki", () => ({
  codeToTokens: vi.fn(async (code: string) => ({
    tokens: String(code)
      .split("\n")
      .map((line, index) => [
        {
          content: line || "highlighted",
          offset: index,
          color: "#fff",
          fontStyle: 0,
        },
      ]),
    fg: "#e1e4e8",
    bg: "#24292e",
    themeName: "github-dark",
  })),
}));
vi.mock("@/lib/clipboard", () => ({ writeClipboard: vi.fn(async () => true) }));
vi.mock("@/lib/toast", () => ({ toastClipboard: vi.fn() }));
vi.mock("@/vault/api", () => ({
  vaultApi: {
    saveVault: vi.fn(async () => {}),
    getVault: vi.fn(async () => "{}"),
  },
}));

const clip = vi.mocked(writeClipboard);
const toastClip = vi.mocked(toastClipboard);
const api = vi.mocked(vaultApi);
const NOW = "2026-07-07T00:00:00.000Z";

function cmd(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id: "c1",
    category: "git",
    title: "Status",
    description: "Show status",
    snippets: [{ language: "bash", code: "git status" }],
    primaryCopyTemplate: "git status",
    arguments: [],
    tags: ["vcs"],
    updatedAt: NOW,
    ...overrides,
  };
}

function setModel(commands: CommandEntry[]) {
  useVaultStore.setState({
    model: {
      ...createDefaultModel(NOW),
      modules: { [COMMANDS_MODULE_ID]: commands },
    },
  });
}

describe("CommandsListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setModel([]);
  });

  it("shows an empty state and groups commands by category once present", () => {
    const { rerender } = render(<CommandsListView items={[]} />);
    expect(screen.getByText(/no commands yet/i)).toBeInTheDocument();

    rerender(
      <CommandsListView
        items={[
          cmd(),
          cmd({
            id: "c2",
            category: "docker",
            title: "Run",
            description: "Start a container",
            snippets: [{ language: "bash", code: "docker run" }],
            primaryCopyTemplate: "docker run",
          }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "git" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "docker" })).toBeInTheDocument();
    expect(screen.getByText("Show status")).toBeInTheDocument();
    expect(screen.getByText("Start a container")).toBeInTheDocument();
    expect(screen.getByText("git status")).toBeInTheDocument();
    expect(screen.getByText("docker run")).toBeInTheDocument();
  });

  it("filters commands", async () => {
    const user = userEvent.setup();
    render(
      <CommandsListView items={[cmd(), cmd({ id: "c2", title: "Rebase" })]} />,
    );
    await user.type(screen.getByLabelText("Filter commands"), "rebase");
    expect(screen.getAllByText("Rebase").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /actions for status/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(screen.getByLabelText("Filter commands")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /actions for status/i }),
    ).toBeInTheDocument();
  });

  it("shows a no-matches state when the filter excludes everything", async () => {
    const user = userEvent.setup();
    render(<CommandsListView items={[cmd()]} />);
    await user.type(screen.getByLabelText("Filter commands"), "zzz-nomatch");
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("opens a command from its title and can cancel delete", async () => {
    const user = userEvent.setup();
    render(<CommandsListView items={[cmd()]} />);

    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByRole("dialog", { name: "Status" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close details" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Status" }),
      ).not.toBeInTheDocument(),
    );

    await chooseRowAction(user, "Status", "Delete");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /actions for status/i }),
    ).toBeInTheDocument();
  });

  it("closes the fill-in dialog without copying", async () => {
    const user = userEvent.setup();
    render(
      <CommandsListView
        items={[cmd({ primaryCopyTemplate: "git push origin {{branch}}" })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copy Status" }));
    expect(screen.getByRole("dialog", { name: /copy status/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close details" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /copy status/i }),
      ).not.toBeInTheDocument(),
    );
    expect(clip).not.toHaveBeenCalled();
  });

  it("copies a placeholder-free command immediately", async () => {
    const user = userEvent.setup();
    render(<CommandsListView items={[cmd()]} />);
    await user.click(screen.getByRole("button", { name: "Copy Status" }));
    expect(clip).toHaveBeenCalledWith("git status");
    await waitFor(() =>
      expect(toastClip).toHaveBeenCalledWith(true, "Command copied"),
    );
  });

  it("opens the fill-in for a command with placeholders and copies the completed text", async () => {
    const user = userEvent.setup();
    render(
      <CommandsListView
        items={[
          cmd({
            title: "Push",
            primaryCopyTemplate: "git push origin {{branch}}",
          }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copy Push" }));

    await user.type(screen.getByLabelText("branch"), "main");
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(clip).toHaveBeenCalledWith("git push origin main");
  });

  it("copies the raw template from the fill-in", async () => {
    const user = userEvent.setup();
    render(
      <CommandsListView
        items={[cmd({ primaryCopyTemplate: "git push origin {{branch}}" })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copy Status" }));
    await user.click(screen.getByRole("button", { name: /copy raw/i }));
    expect(clip).toHaveBeenCalledWith("git push origin {{branch}}");
  });

  it("creates a command through the edit form", async () => {
    const user = userEvent.setup();
    render(<CommandsListView items={[]} />);
    await user.click(screen.getByRole("button", { name: "New" }));

    await user.type(screen.getByLabelText("Command title"), "List files");
    await user.selectOptions(screen.getByLabelText("Command category"), "Dev");
    await user.type(screen.getByLabelText("Command description"), "list all");
    await user.selectOptions(screen.getByLabelText("Snippet language"), "bash");
    await user.type(screen.getByLabelText("Command code"), "ls -la");
    await user.type(screen.getByLabelText("Command arguments"), "path");
    await user.click(screen.getByRole("checkbox", { name: "Bash" }));
    await user.click(screen.getByRole("checkbox", { name: "CSS" }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(api.saveVault).toHaveBeenCalled());
    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.commands[0].title).toBe("List files");
    expect(saved.modules.commands[0].category).toBe("Dev");
    expect(saved.modules.commands[0].snippets[0].language).toBe("bash");
    expect(saved.modules.commands[0].tags).toEqual(
      expect.arrayContaining(["React", "Bash", "CSS"]),
    );
  });

  it("deletes a command", async () => {
    const user = userEvent.setup();
    render(<CommandsListView items={[cmd()]} />);
    await chooseRowAction(user, "Status", "Delete");
    await confirmDelete(user);
    await waitFor(() => expect(api.saveVault).toHaveBeenCalled());
  });

  it("selects a command and copies from the detail pane", async () => {
    const user = userEvent.setup();
    render(
      <CommandsListView
        items={[
          cmd(),
          cmd({ id: "c2", title: "Rebase", primaryCopyTemplate: "git rebase" }),
        ]}
      />,
    );
    await chooseRowAction(user, "Rebase", "View");
    const dialog = screen.getByRole("dialog", { name: "Rebase" });
    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(clip).toHaveBeenCalledWith("git rebase");
  });

  it("runs detail edit, close, and delete actions", async () => {
    const user = userEvent.setup();
    render(<CommandsListView items={[cmd()]} />);

    await chooseRowAction(user, "Status", "View");
    let dialog = screen.getByRole("dialog", { name: "Status" });
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("heading", { name: /edit command/i }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /cancel command edit/i }),
    );
    expect(screen.getByRole("heading", { name: "Commands" })).toBeVisible();

    await chooseRowAction(user, "Status", "View");
    dialog = screen.getByRole("dialog", { name: "Status" });
    await user.click(
      within(dialog).getByRole("button", { name: /close details/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Status" }),
      ).not.toBeInTheDocument(),
    );

    await chooseRowAction(user, "Status", "View");
    dialog = screen.getByRole("dialog", { name: "Status" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await confirmDelete(user);
    await waitFor(() => expect(api.saveVault).toHaveBeenCalled());
  });

  it("cancels the fill-in", async () => {
    const user = userEvent.setup();
    render(
      <CommandsListView
        items={[cmd({ primaryCopyTemplate: "git push {{branch}}" })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copy Status" }));
    await screen.findByLabelText("branch");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByLabelText("branch")).not.toBeInTheDocument(),
    );
  });
});

describe("CommandDetailView", () => {
  it("renders the highlighted snippet", async () => {
    render(<CommandDetailView item={cmd()} />);
    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("git status")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Copy line 1" }),
    ).toBeInTheDocument();
  });
});

describe("CommandEditView", () => {
  it("blocks save until required fields are present", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CommandEditView onCancel={() => {}} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });

  it("edits an existing command, keeping its id", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <CommandEditView item={cmd()} onCancel={() => {}} onSave={onSave} />,
    );
    await user.clear(screen.getByLabelText("Command title"));
    await user.type(screen.getByLabelText("Command title"), "Renamed");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1", title: "Renamed" }),
    );
  });
});
