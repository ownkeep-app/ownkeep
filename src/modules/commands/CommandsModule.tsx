import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import { FillInForm } from "./FillInForm";
import { SnippetView } from "./highlight";
import {
  commandEntries,
  createCommandEntry,
  emptyCommandForm,
  formFromCommand,
  groupByCategory,
  parsePlaceholders,
  updateCommandEntry,
  validateCommandInput,
} from "./logic";
import type { CommandEntry, CommandFormInput } from "./types";

export function CommandsListView({ items }: ListViewProps<CommandEntry>) {
  const saveCommand = useVaultStore((s) => s.saveCommand);
  const deleteCommand = useVaultStore((s) => s.deleteCommand);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CommandEntry | null | undefined>();
  const [copying, setCopying] = useState<CommandEntry | null>(null);

  const commands = useMemo(() => commandEntries(items), [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter((item) =>
      [item.title, item.category, item.description, item.primaryCopyTemplate]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [commands, query]);
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const selected =
    commands.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  const startCreate = () => setEditing(null);

  async function handleSave(entry: CommandEntry) {
    await saveCommand(entry);
    setSelectedId(entry.id);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteCommand(id);
    if (selectedId === id) setSelectedId(null);
  }

  async function copyText(text: string, note: string) {
    const ok = await writeClipboard(text);
    toastClipboard(ok, note);
  }

  function startCopy(command: CommandEntry) {
    setSelectedId(command.id);
    if (parsePlaceholders(command.primaryCopyTemplate).length > 0) {
      setCopying(command);
    } else {
      void copyText(command.primaryCopyTemplate, "Command copied");
    }
  }

  if (editing !== undefined) {
    return (
      <CommandEditView
        item={editing ?? undefined}
        onCancel={() => setEditing(undefined)}
        onSave={(entry) => void handleSave(entry)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">Commands</h1>
          <p className="text-sm text-muted-foreground">
            {commands.length} saved{" "}
            {commands.length === 1 ? "command" : "commands"}
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border p-4">
            <Input
              aria-label="Filter commands"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter commands"
              value={query}
            />
          </div>

          {groups.length === 0 ? (
            query.trim() ? (
              <EmptyState
                title="No matches"
                description={`Nothing matches “${query.trim()}”.`}
              />
            ) : (
              <EmptyState
                title="No commands yet"
                description="Save a snippet with {{ }} placeholders to reuse it fast."
                action={
                  <Button onClick={startCreate}>
                    <Plus className="h-4 w-4" />
                    New command
                  </Button>
                }
              />
            )
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {groups.map((group) => (
                <section key={group.category} className="mb-3">
                  <h2 className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
                    {group.category}
                  </h2>
                  <ul>
                    {group.commands.map((command) => (
                      <li
                        className={
                          selected?.id === command.id
                            ? "flex items-center gap-2 rounded-md bg-accent/60 px-2 py-1.5"
                            : "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
                        }
                        key={command.id}
                      >
                        <button
                          className="min-w-0 flex-1 truncate text-left text-sm"
                          onClick={() => setSelectedId(command.id)}
                          type="button"
                        >
                          {command.title}
                        </button>
                        <Button
                          aria-label={`Copy ${command.title}`}
                          onClick={() => startCopy(command)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Edit ${command.title}`}
                          onClick={() => setEditing(command)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Delete ${command.title}`}
                          onClick={() => void handleDelete(command.id)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="w-96 border-l border-border">
          {copying ? (
            <FillInForm
              command={copying}
              onCancel={() => setCopying(null)}
              onComplete={(filled) => {
                setCopying(null);
                void copyText(filled, "Command copied");
              }}
              onRaw={() => {
                setCopying(null);
                void copyText(
                  copying.primaryCopyTemplate,
                  "Raw command copied",
                );
              }}
            />
          ) : selected ? (
            <CommandDetailView
              item={selected}
              onCopy={() => startCopy(selected)}
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Select a command to inspect it.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function CommandDetailView({
  item,
  onCopy,
}: {
  item: CommandEntry;
  onCopy?: () => void;
}) {
  const snippet = item.snippets[0];
  return (
    <div className="space-y-4 p-6">
      <div>
        <p className="text-xs uppercase text-muted-foreground">
          {item.category}
        </p>
        <h2 className="text-lg font-semibold">{item.title}</h2>
        {item.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>
      {snippet && (
        <SnippetView code={snippet.code} language={snippet.language} />
      )}
      {item.tags.length > 0 && (
        <p className="text-xs text-muted-foreground">{item.tags.join(", ")}</p>
      )}
      {onCopy && (
        <Button onClick={onCopy} type="button">
          <Copy className="h-4 w-4" />
          Copy
        </Button>
      )}
    </div>
  );
}

export function CommandEditView({
  item,
  onSave,
  onCancel,
}: {
  item?: CommandEntry;
  onSave: (item: CommandEntry) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CommandFormInput>(
    item ? formFromCommand(item) : emptyCommandForm(),
  );
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CommandFormInput>(
    key: K,
    value: CommandFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateCommandInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    const now = new Date().toISOString();
    onSave(
      item
        ? updateCommandEntry(item, form, now)
        : createCommandEntry(form, now),
    );
  }

  return (
    <form className="flex h-full flex-col" onSubmit={submit}>
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="min-w-0 flex-1 text-lg font-semibold">
          {item ? "Edit command" : "New command"}
        </h1>
        <Button
          aria-label="Cancel command edit"
          onClick={onCancel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid max-w-3xl gap-4 overflow-auto p-6">
        <Field label="Title">
          <Input
            aria-label="Command title"
            autoFocus
            onChange={(event) => update("title", event.target.value)}
            value={form.title}
          />
        </Field>
        <Field label="Category">
          <Input
            aria-label="Command category"
            onChange={(event) => update("category", event.target.value)}
            value={form.category}
          />
        </Field>
        <Field label="Description">
          <Input
            aria-label="Command description"
            onChange={(event) => update("description", event.target.value)}
            value={form.description}
          />
        </Field>
        <Field label="Language">
          <Input
            aria-label="Snippet language"
            onChange={(event) => update("language", event.target.value)}
            value={form.language}
          />
        </Field>
        <Field label="Command (use {{name}} placeholders)">
          <textarea
            aria-label="Command code"
            className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(event) => update("code", event.target.value)}
            value={form.code}
          />
        </Field>
        <Field label="Arguments (one per line: name  or  name = a, b, c)">
          <textarea
            aria-label="Command arguments"
            className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(event) => update("argumentsText", event.target.value)}
            value={form.argumentsText}
          />
        </Field>
        <Field label="Tags">
          <Input
            aria-label="Command tags"
            onChange={(event) => update("tags", event.target.value)}
            placeholder="git, vcs"
            value={form.tags}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit">Save</Button>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
