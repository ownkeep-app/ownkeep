import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { CategorySelect } from "@/components/category-select";
import { DetailModal } from "@/components/DetailModal";
import {
  DetailField,
  DetailFields,
  DetailFieldSpan,
  DetailModalBody,
  DetailModalHero,
} from "@/components/detail-fields";
import { EmptyState } from "@/components/EmptyState";
import { ItemFormShell } from "@/components/ItemFormShell";
import {
  LanguageSelect,
  snippetLanguageLabel,
} from "@/components/language-select";
import { TagMultiSelect } from "@/components/tag-multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTaxonomySettings } from "@/hooks/use-taxonomy-settings";
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
  const [viewing, setViewing] = useState<CommandEntry | null>(null);
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

  const startCreate = () => setEditing(null);

  async function handleSave(entry: CommandEntry) {
    await saveCommand(entry);
    setViewing(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteCommand(id);
    if (viewing?.id === id) setViewing(null);
  }

  async function copyText(text: string, note: string) {
    const ok = await writeClipboard(text);
    toastClipboard(ok, note);
  }

  function startCopy(command: CommandEntry) {
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

      <div className="flex min-h-0 flex-1 flex-col">
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
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {groups.map((group) => (
              <section className="mb-6" key={group.category}>
                <h2 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  {group.category}
                </h2>
                <ul className="space-y-3">
                  {group.commands.map((command) => {
                    const snippet = command.snippets[0];
                    return (
                      <li
                        className="rounded-md border border-border p-3 hover:bg-accent/40"
                        key={command.id}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {command.title}
                            </p>
                            {command.description && (
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {command.description}
                              </p>
                            )}
                            {snippet && (
                              <div className="mt-2 overflow-x-auto">
                                <SnippetView
                                  code={snippet.code}
                                  language={snippet.language}
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              aria-label={`View ${command.title}`}
                              onClick={() => setViewing(command)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
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
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <DetailModal
          actions={
            viewing && (
              <>
                <Button
                  onClick={() => startCopy(viewing)}
                  type="button"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button
                  onClick={() => {
                    setViewing(null);
                    setEditing(viewing);
                  }}
                  type="button"
                  variant="outline"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  onClick={() => void handleDelete(viewing.id)}
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            )
          }
          onClose={() => setViewing(null)}
          open={viewing !== null}
          title={viewing?.title ?? ""}
        >
          {viewing && <CommandDetailView item={viewing} />}
        </DetailModal>

        <DetailModal
          onClose={() => setCopying(null)}
          open={copying !== null}
          title={copying ? `Copy ${copying.title}` : ""}
        >
          {copying && (
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
          )}
        </DetailModal>
      </div>
    </div>
  );
}

export function CommandDetailView({ item }: { item: CommandEntry }) {
  const snippet = item.snippets[0];
  return (
    <DetailModalBody>
      <DetailModalHero>
        <p className="text-xs uppercase text-muted-foreground">
          {item.category}
        </p>
        <h2 className="text-lg font-semibold">{item.title}</h2>
        {item.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </p>
        )}
      </DetailModalHero>
      <DetailFields>
        {item.tags.length > 0 && (
          <DetailField label="Tags" value={item.tags.join(", ")} />
        )}
        {snippet && (
          <DetailFieldSpan
            label={`Snippet (${snippetLanguageLabel(snippet.language)})`}
          >
            <div className="mt-1">
              <SnippetView code={snippet.code} language={snippet.language} />
            </div>
          </DetailFieldSpan>
        )}
      </DetailFields>
    </DetailModalBody>
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
  const { categoryOptions, tagOptions, taxonomy } = useTaxonomySettings();
  const [form, setForm] = useState<CommandFormInput>(() =>
    item ? formFromCommand(item) : emptyCommandForm(taxonomy),
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
    <ItemFormShell
      cancelLabel="Cancel command edit"
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={item ? "Edit command" : "New command"}
    >
      <Field label="Title">
        <Input
          aria-label="Command title"
          autoFocus
          onChange={(event) => update("title", event.target.value)}
          value={form.title}
        />
      </Field>
      <Field label="Category">
        <CategorySelect
          aria-label="Command category"
          onChange={(event) => update("category", event.target.value)}
          options={categoryOptions}
          value={form.category}
        />
      </Field>
      <Field className="col-span-2" label="Description">
        <Input
          aria-label="Command description"
          onChange={(event) => update("description", event.target.value)}
          value={form.description}
        />
      </Field>
      <Field label="Language">
        <LanguageSelect
          aria-label="Snippet language"
          onChange={(event) => update("language", event.target.value)}
          value={form.language}
        />
      </Field>
      <Field label="Tags">
        <TagMultiSelect
          aria-label="Command tags"
          onChange={(tags) => update("tags", tags)}
          options={tagOptions}
          value={form.tags}
        />
      </Field>
      <Field className="col-span-2" label="Command (use {{name}} placeholders)">
        <textarea
          aria-label="Command code"
          className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => update("code", event.target.value)}
          value={form.code}
        />
      </Field>
      <Field
        className="col-span-2"
        label="Arguments (one per line: name  or  name = a, b, c)"
      >
        <textarea
          aria-label="Command arguments"
          className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => update("argumentsText", event.target.value)}
          value={form.argumentsText}
        />
      </Field>
    </ItemFormShell>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm font-medium", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}
