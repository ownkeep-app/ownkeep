import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { CategorySelect } from "@/components/category-select";
import {
  CategoryFilterSelect,
  categoryFilterOptions,
} from "@/components/category-filter-select";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DetailModal } from "@/components/DetailModal";
import { EmptyState } from "@/components/EmptyState";
import { ItemFormShell } from "@/components/ItemFormShell";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { ListItemTitle } from "@/components/ListItemTitle";
import { MarkdownEditor, CopyableMarkdownPreview } from "@/components/MarkdownEditor";
import { CopyableLines } from "@/components/CopyableLines";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/date";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
import { useTaxonomySettings } from "@/hooks/use-taxonomy-settings";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import {
  createNoteEntry,
  emptyNoteForm,
  formFromNote,
  groupNotesByCategory,
  noteEntries,
  updateNoteEntry,
  validateNoteInput,
} from "./logic";
import type { NoteEntry, NoteFormInput } from "./types";

export function NotesListView({
  items,
  focusItemId,
  onFocusItemHandled,
}: ListViewProps<NoteEntry>) {
  const saveNote = useVaultStore((s) => s.saveNote);
  const deleteNote = useVaultStore((s) => s.deleteNote);
  const { categoryOptions } = useTaxonomySettings();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [viewing, setViewing] = useState<NoteEntry | null>(null);
  const [editing, setEditing] = useState<NoteEntry | null | undefined>();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const notes = useMemo(() => noteEntries(items), [items]);
  const filterCategories = useMemo(
    () =>
      categoryFilterOptions(
        categoryOptions,
        notes.map((item) => item.category),
      ),
    [categoryOptions, notes],
  );
  const filtersActive = Boolean(query.trim()) || Boolean(categoryFilter);
  useClearFiltersOnEscape(filtersActive, () => {
    setQuery("");
    setCategoryFilter("");
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const byCategory = categoryFilter
      ? notes.filter((item) => item.category === categoryFilter)
      : notes;
    if (!term) return byCategory;
    return byCategory.filter((item) =>
      [item.name, item.category, item.content]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [notes, query, categoryFilter]);

  const groups = useMemo(
    () => groupNotesByCategory(filtered),
    [filtered],
  );

  useEffect(() => {
    if (!focusItemId) return;
    const item = notes.find((note) => note.id === focusItemId);
    if (!item) return;
    setViewing(item);
    onFocusItemHandled?.();
  }, [focusItemId, notes, onFocusItemHandled]);

  const startCreate = () => setEditing(null);

  async function handleSave(entry: NoteEntry) {
    await saveNote(entry);
    setViewing(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteNote(id);
    if (viewing?.id === id) setViewing(null);
    setPendingDelete(null);
  }

  if (editing !== undefined) {
    return (
      <NoteEditView
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
          <h1 className="text-lg font-semibold">Notes</h1>
          <p className="text-sm text-muted-foreground">
            {notes.length} saved {notes.length === 1 ? "note" : "notes"}
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
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter notes"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter notes"
              value={query}
            />
          </div>
          {filtersActive ? (
            <ClearFiltersButton
              onClear={() => {
                setQuery("");
                setCategoryFilter("");
              }}
            />
          ) : null}
        </div>

        {groups.length === 0 ? (
          query.trim() || categoryFilter ? (
            <EmptyState
              title="No matches"
              description={
                query.trim()
                  ? `Nothing matches “${query.trim()}”.`
                  : "Nothing in this category."
              }
            />
          ) : (
            <EmptyState
              title="No notes yet"
              description="Capture Markdown notes and browse them by category."
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  New note
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
                  {group.notes.map((note) => {
                    return (
                      <li
                        className="rounded-md border border-border bg-card p-3 hover:bg-accent/40"
                        key={note.id}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <ListItemTitle
                              className="min-w-0 flex-1 text-xl leading-7"
                              onOpen={() => setViewing(note)}
                            >
                              {note.name}
                            </ListItemTitle>
                            <p className="shrink-0 text-xs leading-5 text-muted-foreground">
                              Updated {formatDate(note.updatedAt)}
                            </p>
                            <div className="-mr-1.5 -mt-0.5 shrink-0 [&_button]:h-7 [&_button]:w-7">
                              <RowActionsMenu
                                label={`Actions for ${note.name}`}
                                actions={[
                                  {
                                    label: "View",
                                    icon: <Eye className="h-4 w-4" />,
                                    onSelect: () => setViewing(note),
                                  },
                                  {
                                    label: "Edit",
                                    icon: <Pencil className="h-4 w-4" />,
                                    onSelect: () => setEditing(note),
                                  },
                                  {
                                    label: "Delete",
                                    icon: <Trash2 className="h-4 w-4" />,
                                    destructive: true,
                                    onSelect: () =>
                                      setPendingDelete({
                                        id: note.id,
                                        name: note.name,
                                      }),
                                  },
                                ]}
                              />
                            </div>
                          </div>
                          {note.content.trim() ? (
                            <div className="mt-1">
                              <CopyableLines
                                maxLines={3}
                                skipBlankLines
                                text={note.content}
                              />
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <DetailModal
        actions={
          viewing && (
            <>
              <Button
                onClick={() =>
                  setPendingDelete({
                    id: viewing.id,
                    name: viewing.name,
                  })
                }
                type="button"
                variant="destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
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
        ariaLabel={viewing?.name ?? "Note"}
        beforeClose={
          viewing ? (
            <p className="shrink-0 text-xs text-muted-foreground">
              Updated {formatDate(viewing.updatedAt)}
            </p>
          ) : null
        }
        onClose={() => setViewing(null)}
        open={viewing !== null}
        title={
          viewing ? (
            <>
              <span className="truncate">{viewing.name}</span>
              {viewing.category.trim() ? (
                <span className="ml-2 shrink-0 font-normal text-muted-foreground">
                  [{viewing.category}]
                </span>
              ) : null}
            </>
          ) : (
            ""
          )
        }
        titleClassName="flex items-center text-xl"
      >
        {viewing && <NoteDetailView item={viewing} />}
      </DetailModal>

      <ConfirmDeleteDialog
        itemName={pendingDelete?.name ?? ""}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete.id);
        }}
        open={pendingDelete !== null}
      />
    </div>
  );
}

export function NoteDetailView({ item }: { item: NoteEntry }) {
  return (
    <div className="p-6">
      {item.content.trim() ? (
        <CopyableMarkdownPreview content={item.content} />
      ) : (
        <p className="text-sm text-muted-foreground">Empty note.</p>
      )}
    </div>
  );
}

export function NoteEditView({
  item,
  onSave,
  onCancel,
}: {
  item?: NoteEntry;
  onSave: (item: NoteEntry) => void;
  onCancel: () => void;
}) {
  const { categoryOptions, taxonomy } = useTaxonomySettings();
  const [form, setForm] = useState<NoteFormInput>(() =>
    item ? formFromNote(item) : emptyNoteForm(taxonomy),
  );
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof NoteFormInput>(
    key: K,
    value: NoteFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateNoteInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    const now = new Date().toISOString();
    onSave(
      item ? updateNoteEntry(item, form, now) : createNoteEntry(form, now),
    );
  }

  return (
    <ItemFormShell
      cancelLabel="Cancel"
      description="Write Markdown in Write mode, or switch to Preview to render it."
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={item ? "Edit note" : "New note"}
    >
      <div className="col-span-2 grid grid-cols-4 gap-4">
        <label className="col-span-3 space-y-1 text-sm font-medium">
          Name
          <Input
            aria-label="Note name"
            onChange={(event) => update("name", event.target.value)}
            value={form.name}
          />
        </label>
        <label className="col-span-1 space-y-1 text-sm font-medium">
          Category
          <CategorySelect
            aria-label="Note category"
            onChange={(event) => update("category", event.target.value)}
            options={categoryOptions}
            value={form.category}
          />
        </label>
      </div>
      <div className="col-span-2 space-y-1 text-sm font-medium">
        Content
        <MarkdownEditor
          ariaLabel="Note content"
          onChange={(value) => update("content", value)}
          value={form.content}
        />
      </div>
    </ItemFormShell>
  );
}
