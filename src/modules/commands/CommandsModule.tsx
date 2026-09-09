import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { CategorySelect } from "@/components/category-select";
import {
  CategoryFilterSelect,
  categoryFilterOptions,
} from "@/components/category-filter-select";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
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
import { LanguageSelect } from "@/components/language-select";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { ListItemTitle } from "@/components/ListItemTitle";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { snippetLanguageLabel } from "@/components/snippet-languages";
import { TagMultiSelect } from "@/components/tag-multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
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
  groupByTag,
  parsePlaceholders,
  updateCommandEntry,
  validateCommandInput,
} from "./logic";
import type { CommandEntry, CommandFormInput } from "./types";

export function CommandsListView({ items }: ListViewProps<CommandEntry>) {
  const saveCommand = useVaultStore((s) => s.saveCommand);
  const deleteCommand = useVaultStore((s) => s.deleteCommand);
  const { categoryOptions } = useTaxonomySettings();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [viewing, setViewing] = useState<CommandEntry | null>(null);
  const [editing, setEditing] = useState<CommandEntry | null | undefined>();
  const [copying, setCopying] = useState<CommandEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const commands = useMemo(() => commandEntries(items), [items]);
  const filterCategories = useMemo(
    () =>
      categoryFilterOptions(
        categoryOptions,
        commands.map((item) => item.category),
      ),
    [categoryOptions, commands],
  );
  const filtersActive = Boolean(query.trim()) || Boolean(categoryFilter);
  useClearFiltersOnEscape(filtersActive, () => {
    setQuery("");
    setCategoryFilter("");
  });
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const byCategory = categoryFilter
      ? commands.filter((item) => item.category === categoryFilter)
      : commands;
    if (!term) return byCategory;
    return byCategory.filter((item) =>
      [
        item.title,
        item.category,
        item.description,
        item.primaryCopyTemplate,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [commands, query, categoryFilter]);
  const groups = useMemo(() => groupByTag(filtered), [filtered]);
  const indexedGroups = useMemo(() => {
    let next = 0;
    return groups.map((group) => ({
      tag: group.tag,
      commands: group.commands.map((command) => ({
        command,
        index: ++next,
      })),
    }));
  }, [groups]);

  const startCreate = () => setEditing(null);

  async function handleSave(entry: CommandEntry) {
    await saveCommand(entry);
    setViewing(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteCommand(id);
    if (viewing?.id === id) setViewing(null);
    setPendingDelete(null);
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
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <CategoryFilterSelect
            onChange={setCategoryFilter}
            options={filterCategories}
            value={categoryFilter}
          />
          <Input
            aria-label="Filter commands"
            className="min-w-0 flex-1"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter commands"
            value={query}
          />
          {filtersActive ? (
            <ClearFiltersButton
              onClear={() => {
                setQuery("");
                setCategoryFilter("");
              }}
            />
          ) : null}
        </div>

        {indexedGroups.length === 0 ? (
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
            {indexedGroups.map((group) => (
              <section className="mb-6" key={group.tag}>
                <h2 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  {group.tag}
                </h2>
                <ul className="space-y-3">
                  {group.commands.map(({ command, index }) => {
                    const snippet = command.snippets[0];
                    return (
                      <li
                        className="rounded-md border border-border bg-card p-3 hover:bg-accent/40"
                        key={`${group.tag}-${command.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            aria-hidden="true"
                            className="w-6 shrink-0 pt-0.5 text-center text-sm tabular-nums text-muted-foreground"
                          >
                            {index}
                          </span>
                          <div className="min-w-0 flex-1">
                            <ListItemTitle
                              className="text-sm"
                              onOpen={() => setViewing(command)}
                            >
                              {command.title}
                            </ListItemTitle>
                            {command.description && (
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {command.description}
                              </p>
                            )}
                            {snippet && (
                              <div className="mt-2 overflow-x-auto">
                                <SnippetView
                                  arguments={command.arguments}
                                  code={snippet.code}
                                  language={snippet.language}
                                  title={command.title}
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              aria-label={`Copy ${command.title}`}
                              onClick={() => startCopy(command)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <RowActionsMenu
                              label={`Actions for ${command.title}`}
                              actions={[
                                {
                                  label: "View",
                                  icon: <Eye className="h-4 w-4" />,
                                  onSelect: () => setViewing(command),
                                },
                                {
                                  label: "Edit",
                                  icon: <Pencil className="h-4 w-4" />,
                                  onSelect: () => setEditing(command),
                                },
                                {
                                  label: "Delete",
                                  icon: <Trash2 className="h-4 w-4" />,
                                  destructive: true,
                                  onSelect: () =>
                                    setPendingDelete({
                                      id: command.id,
                                      name: command.title,
                                    }),
                                },
                              ]}
                            />
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
                  onClick={() =>
                    setPendingDelete({
                      id: viewing.id,
                      name: viewing.title,
                    })
                  }
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
                <Button
                  onClick={() => startCopy(viewing)}
                  type="button"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button
                  className="ml-auto"
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
              </>
            )
          }
          onClose={() => setViewing(null)}
          open={viewing !== null}
          title={viewing?.title ?? ""}
        >
          {viewing && <CommandDetailView item={viewing} />}
        </DetailModal>

        <ConfirmDeleteDialog
          itemName={pendingDelete?.name ?? ""}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) void handleDelete(pendingDelete.id);
          }}
          open={pendingDelete !== null}
        />

        <DetailModal
          onClose={() => setCopying(null)}
          open={copying !== null}
          title={copying ? `Copy ${copying.title}` : ""}
        >
          {copying && (
            <FillInForm
              arguments={copying.arguments}
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
              template={copying.primaryCopyTemplate}
              title={copying.title}
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
              <SnippetView
                arguments={item.arguments}
                code={snippet.code}
                language={snippet.language}
                title={item.title}
              />
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
      <Field className="col-span-2" label="Title">
        <Input
          aria-label="Command title"
          autoFocus
          onChange={(event) => update("title", event.target.value)}
          value={form.title}
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
      <Field label="Category">
        <CategorySelect
          aria-label="Command category"
          onChange={(event) => update("category", event.target.value)}
          options={categoryOptions}
          value={form.category}
        />
      </Field>
      <Field className="col-span-2" label="Tags">
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
          className="min-h-24 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
