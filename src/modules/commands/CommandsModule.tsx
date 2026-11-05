import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { CategoryBadge } from "@/components/CategoryBadge";
import { CategorySelect } from "@/components/category-select";
import {
  CategoryFilterSelect,
  categoryFilterOptions,
} from "@/components/category-filter-select";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DetailModal } from "@/components/DetailModal";
import { DragHandle, SORTABLE_ITEM_CLASS } from "@/components/DragHandle";
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
import { useT } from "@/i18n";
import { writeClipboard } from "@/lib/clipboard";
import { moveItem } from "@/lib/reorder";
import { toastClipboard, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
import { useDragSort } from "@/hooks/use-drag-sort";
import { useTaxonomySettings } from "@/hooks/use-taxonomy-settings";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import { hasManualOrder } from "@/vault/model";
import { FillInForm } from "./FillInForm";
import { SnippetView } from "./highlight";
import {
  commandEntries,
  createCommandEntry,
  emptyCommandForm,
  formFromCommand,
  sortCommandsByTitle,
  parsePlaceholders,
  updateCommandEntry,
  validateCommandInput,
} from "./logic";
import {
  COMMANDS_MODULE_ID,
  type CommandEntry,
  type CommandFormInput,
} from "./types";

export function CommandsListView({ items }: ListViewProps<CommandEntry>) {
  const { t, tp } = useT();
  const saveCommand = useVaultStore((s) => s.saveCommand);
  const deleteCommand = useVaultStore((s) => s.deleteCommand);
  const reorderItems = useVaultStore((s) => s.reorderItems);
  const manualOrder = useVaultStore(
    (s) =>
      s.model !== null && hasManualOrder(s.model.settings, COMMANDS_MODULE_ID),
  );
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

  const commands = useMemo(() => {
    const stored = commandEntries(items);
    return manualOrder ? stored : sortCommandsByTitle(stored);
  }, [items, manualOrder]);
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
  const filteredIds = filtered.map((item) => item.id);
  const sort = useDragSort((activeId, overId) => {
    // The whole list, so a drag under a filter keeps the hidden commands in place. Its first drag
    // freezes the order on screen, which until then was only computed.
    reorderItems(
      COMMANDS_MODULE_ID,
      moveItem(commands, activeId, overId),
    ).catch(() => toastError(t("common.reorderFailed")));
  });

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
      void copyText(command.primaryCopyTemplate, t("commandBar.commandCopied"));
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
          <h1 className="text-lg font-semibold">{t("module.commands")}</h1>
          <p className="text-sm text-muted-foreground">
            {tp("commands.savedCount", commands.length)}
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          {t("common.new")}
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
            aria-label={t("commands.filter")}
            className="min-w-0 flex-1"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("commands.filter")}
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

        {filtered.length === 0 ? (
          query.trim() ? (
            <EmptyState
              title={t("common.noMatches")}
              description={t("common.nothingMatches", { query: query.trim() })}
            />
          ) : (
            <EmptyState
              title={t("commands.emptyTitle")}
              description={t("commands.emptyBody")}
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  {t("commands.new")}
                </Button>
              }
            />
          )
        ) : (
          <ul className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {filtered.map((command, index) => {
              const snippet = command.snippets[0];
              return (
                <li
                  className={cn(
                    "rounded-md border border-border bg-card p-3 hover:bg-accent/40",
                    SORTABLE_ITEM_CLASS,
                  )}
                  key={command.id}
                  {...sort.itemProps(command.id)}
                >
                  <div className="flex items-start gap-2">
                    <DragHandle
                      className="-ml-1"
                      itemName={command.title}
                      {...sort.handleProps(command.id, filteredIds)}
                    />
                    <span
                      aria-hidden="true"
                      className="w-6 shrink-0 pt-0.5 text-center text-sm tabular-nums text-muted-foreground"
                    >
                      {index + 1}
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
                      {command.tags.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {command.tags.map((tag) => (
                            <span
                              className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                              key={tag}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
                      <CategoryBadge
                        category={command.category}
                        className="mr-1"
                      />
                      <Button
                        aria-label={t("commands.copyTitle", {
                          title: command.title,
                        })}
                        onClick={() => startCopy(command)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <RowActionsMenu
                        label={t("common.actionsFor", {
                          name: command.title,
                        })}
                        actions={[
                          {
                            label: t("common.view"),
                            icon: <Eye className="h-4 w-4" />,
                            onSelect: () => setViewing(command),
                          },
                          {
                            label: t("common.edit"),
                            icon: <Pencil className="h-4 w-4" />,
                            onSelect: () => setEditing(command),
                          },
                          {
                            label: t("common.delete"),
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
                  {t("common.delete")}
                </Button>
                <Button
                  onClick={() => startCopy(viewing)}
                  type="button"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  {t("common.copy")}
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
                  {t("common.edit")}
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
          title={
            copying ? t("commands.copyTitle", { title: copying.title }) : ""
          }
        >
          {copying && (
            <FillInForm
              arguments={copying.arguments}
              onCancel={() => setCopying(null)}
              onComplete={(filled) => {
                setCopying(null);
                void copyText(filled, t("commandBar.commandCopied"));
              }}
              onRaw={() => {
                setCopying(null);
                void copyText(
                  copying.primaryCopyTemplate,
                  t("commandBar.rawCommandCopied"),
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
  const { t } = useT();
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
          <DetailField label={t("field.tags")} value={item.tags.join(", ")} />
        )}
        {snippet && (
          <DetailFieldSpan
            label={t("commands.snippetWithLanguage", {
              language: snippetLanguageLabel(snippet.language),
            })}
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
  const { t } = useT();
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
      cancelLabel={t("commands.cancelEdit")}
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={t(item ? "commands.edit" : "commands.new")}
    >
      <Field className="col-span-2" label={t("field.title")}>
        <Input
          aria-label={t("commands.titleLabel")}
          autoFocus
          onChange={(event) => update("title", event.target.value)}
          value={form.title}
        />
      </Field>
      <Field className="col-span-2" label={t("field.description")}>
        <Input
          aria-label={t("commands.descriptionLabel")}
          onChange={(event) => update("description", event.target.value)}
          value={form.description}
        />
      </Field>
      <Field label={t("commands.language")}>
        <LanguageSelect
          aria-label={t("commands.snippetLanguage")}
          onChange={(event) => update("language", event.target.value)}
          value={form.language}
        />
      </Field>
      <Field label={t("field.category")}>
        <CategorySelect
          aria-label={t("commands.categoryLabel")}
          onChange={(event) => update("category", event.target.value)}
          options={categoryOptions}
          value={form.category}
        />
      </Field>
      <Field className="col-span-2" label={t("field.tags")}>
        <TagMultiSelect
          aria-label={t("commands.tagsLabel")}
          onChange={(tags) => update("tags", tags)}
          options={tagOptions}
          value={form.tags}
        />
      </Field>
      <Field className="col-span-2" label={t("commands.codeField")}>
        <textarea
          aria-label={t("commands.codeLabel")}
          className="min-h-24 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => update("code", event.target.value)}
          value={form.code}
        />
      </Field>
      <Field className="col-span-2" label={t("commands.argumentsField")}>
        <textarea
          aria-label={t("commands.argumentsLabel")}
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
