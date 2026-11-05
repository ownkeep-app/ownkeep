import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ChevronRight,
  Download,
  Eye,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import {
  CategoryFilterSelect,
  categoryFilterOptions,
} from "@/components/category-filter-select";
import { CategoryBadge } from "@/components/CategoryBadge";
import { CategorySelect } from "@/components/category-select";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DatePicker } from "@/components/date-picker";
import {
  DetailField,
  DetailFields,
  DetailModalBody,
} from "@/components/detail-fields";
import { DetailModal } from "@/components/DetailModal";
import { DragHandle, SORTABLE_ITEM_CLASS } from "@/components/DragHandle";
import { EmptyState } from "@/components/EmptyState";
import { ItemFormShell } from "@/components/ItemFormShell";
import { ListItemTitle } from "@/components/ListItemTitle";
import { Pagination } from "@/components/Pagination";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
import { useDragSort } from "@/hooks/use-drag-sort";
import { useTaxonomySettings } from "@/hooks/use-taxonomy-settings";
import { useT } from "@/i18n";
import { dateInputToIso, formatDate } from "@/lib/date";
import { pageCountFor, pageSlice } from "@/lib/pagination";
import { moveItem } from "@/lib/reorder";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { hasManualOrder } from "@/vault/model";
import { FileThumbnail } from "./FileThumbnail";
import { FileViewer } from "./FileViewer";
import {
  filterFiles,
  formatBytes,
  formFromFile,
  partitionByValidity,
  previewKind,
  sortFiles,
  totalBytes,
  updateFileEntry,
  validateFileInput,
} from "./logic";
import { FILES_MODULE_ID, type FileEntry, type FileFormInput } from "./types";

/** Divides evenly across the 2, 3 and 4 columns the pane usually fits, so full pages have no gaps. */
const FILES_PER_PAGE = 24;
/**
 * `auto-rows-max` because a tile clips its overflow, which lets plain auto rows shrink to fit the pane's
 * height instead of scrolling, cutting off each tile's picture and details.
 */
const FILE_GRID_CLASS =
  "grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] content-start gap-3";

export function FilesListView({
  items,
  focusItemId,
  onFocusItemHandled,
}: ListViewProps<FileEntry>) {
  const { t, tp } = useT();
  const importFiles = useVaultStore((s) => s.importFiles);
  const saveFile = useVaultStore((s) => s.saveFile);
  const deleteFile = useVaultStore((s) => s.deleteFile);
  const reorderItems = useVaultStore((s) => s.reorderItems);
  const manualOrder = useVaultStore(
    (s) =>
      s.model !== null && hasManualOrder(s.model.settings, FILES_MODULE_ID),
  );
  const { categoryOptions } = useTaxonomySettings();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [viewing, setViewing] = useState<FileEntry | null>(null);
  const [editing, setEditing] = useState<FileEntry | null>(null);
  const [previewing, setPreviewing] = useState<FileEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null);
  const [invalidOpen, setInvalidOpen] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const invalidListId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => (manualOrder ? items : sortFiles(items)),
    [items, manualOrder],
  );
  const filtered = useMemo(
    () => filterFiles(sorted, query, categoryFilter),
    [sorted, query, categoryFilter],
  );
  const { valid, invalid } = useMemo(
    () => partitionByValidity(filtered),
    [filtered],
  );
  // Derived, so deleting the last file on the last page lands on the page before it.
  const page = Math.min(
    requestedPage,
    pageCountFor(valid.length, FILES_PER_PAGE),
  );
  const pageFiles = pageSlice(valid, page, FILES_PER_PAGE);
  const filterCategories = useMemo(
    () =>
      categoryFilterOptions(
        categoryOptions,
        items.map((item) => item.category),
      ),
    [categoryOptions, items],
  );
  const sort = useDragSort((activeId, overId) => {
    // The whole list, so a drag under a filter keeps the hidden files in place.
    reorderItems(FILES_MODULE_ID, moveItem(sorted, activeId, overId)).catch(
      () => toastError(t("common.reorderFailed")),
    );
  });
  // Preview steps through the file's own group across every page, or just this file if a filter hides it.
  const previewable = (previewing?.invalid ? invalid : valid).filter((file) =>
    previewKind(file),
  );
  const previewList =
    previewing && !previewable.some((file) => file.id === previewing.id)
      ? [previewing]
      : previewable;
  const filtersActive = Boolean(query.trim()) || Boolean(categoryFilter);
  function clearFilters() {
    setQuery("");
    setCategoryFilter("");
  }
  useClearFiltersOnEscape(filtersActive, clearFilters);
  // A changed filter is a new list, so its page number no longer means anything.
  useEffect(() => setRequestedPage(1), [query, categoryFilter]);

  function goToPage(next: number) {
    setRequestedPage(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  useEffect(() => {
    if (!focusItemId) return;
    const item = items.find((file) => file.id === focusItemId);
    if (!item) return;
    setViewing(item);
    onFocusItemHandled?.();
  }, [focusItemId, items, onFocusItemHandled]);

  async function handleAdd() {
    try {
      const outcome = await importFiles();
      if (!outcome) return;
      const { entries, tooLarge, failed } = outcome;
      if (tooLarge.length > 0) {
        toastError(t("files.tooLarge", { names: tooLarge.join(", ") }));
      }
      for (const { fileName, error } of failed) {
        toastError(t("files.addFailed", { name: fileName, error }));
      }
      if (entries.length > 0) goToPage(1);
      // One file: go straight to its details. Many: add them all and let the user edit as needed.
      if (entries.length === 1) setEditing(entries[0]);
      else if (entries.length > 1) {
        toastSuccess(tp("files.added", entries.length));
      }
    } catch (error) {
      toastError(String(error));
    }
  }

  async function handleSaveCopy(file: FileEntry) {
    try {
      const path = await vaultApi.exportFile(file.id, file.fileName);
      if (path) toastSuccess(t("files.savedTo", { path }));
    } catch (error) {
      toastError(String(error));
    }
  }

  async function handleSave(entry: FileEntry) {
    await saveFile(entry);
    setEditing(null);
  }

  async function handleDelete(file: FileEntry) {
    await deleteFile(file.id);
    if (viewing?.id === file.id) setViewing(null);
    setPendingDelete(null);
  }

  function renderTile(file: FileEntry, peerIds: string[]): ReactNode {
    return (
      <li
        className={cn(
          "flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card hover:bg-accent/40",
          SORTABLE_ITEM_CLASS,
        )}
        key={file.id}
        {...sort.itemProps(file.id)}
      >
        <div className="relative aspect-[4/3] shrink-0 bg-muted/50">
          <FileThumbnail file={file} />
          {/* Overlaid, not wrapping: a button can't contain the PDF preview's iframe, and
                      this also keeps the preview itself from taking any clicks or scrolling. */}
          <button
            aria-label={t(
              previewKind(file) ? "files.previewNamed" : "files.detailsNamed",
              { name: file.title },
            )}
            className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() =>
              previewKind(file) ? setPreviewing(file) : setViewing(file)
            }
            type="button"
          />
          <DragHandle
            className="absolute left-1.5 top-1.5 bg-black/60 text-white hover:bg-black/75 hover:text-white"
            itemName={file.title}
            {...sort.handleProps(file.id, peerIds)}
          />
          <CategoryBadge
            category={file.category}
            className="pointer-events-none absolute right-1.5 top-1.5 max-w-[60%]"
          />
        </div>
        <div
          className="flex shrink-0 items-center gap-1 border-t border-border py-2 pl-3 pr-1"
          title={file.description || undefined}
        >
          <div className="min-w-0 flex-1">
            <ListItemTitle
              className="block w-full truncate text-sm"
              onOpen={() => setViewing(file)}
            >
              {file.title}
            </ListItemTitle>
            <p className="truncate text-xs text-muted-foreground">
              {formatDate(dateInputToIso(file.date))} · {formatBytes(file.size)}
            </p>
          </div>
          <RowActionsMenu
            actions={[
              ...(previewKind(file)
                ? [
                    {
                      label: t("files.preview"),
                      icon: <Eye className="h-4 w-4" />,
                      onSelect: () => setPreviewing(file),
                    },
                  ]
                : []),
              {
                label: t("files.details"),
                icon: <Info className="h-4 w-4" />,
                onSelect: () => setViewing(file),
              },
              {
                label: t("common.edit"),
                icon: <Pencil className="h-4 w-4" />,
                onSelect: () => setEditing(file),
              },
              {
                label: t("files.saveCopy"),
                icon: <Download className="h-4 w-4" />,
                onSelect: () => void handleSaveCopy(file),
              },
              {
                label: t("common.delete"),
                icon: <Trash2 className="h-4 w-4" />,
                destructive: true,
                onSelect: () => setPendingDelete(file),
              },
            ]}
            label={t("common.actionsFor", { name: file.title })}
          />
        </div>
      </li>
    );
  }

  if (editing) {
    return (
      <FileEditView
        item={editing}
        onCancel={() => setEditing(null)}
        onSave={(entry) => void handleSave(entry)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{t("module.files")}</h1>
          <p className="text-sm text-muted-foreground">
            {tp("files.savedCount", items.length)}
            {items.length > 0 ? ` · ${formatBytes(totalBytes(items))}` : ""}
          </p>
        </div>
        <Button onClick={() => void handleAdd()}>
          <Plus className="h-4 w-4" />
          {t("files.add")}
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
              aria-label={t("files.filter")}
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("files.filter")}
              value={query}
            />
          </div>
          {filtersActive ? <ClearFiltersButton onClear={clearFilters} /> : null}
        </div>

        {filtered.length === 0 ? (
          filtersActive ? (
            <EmptyState
              description={
                query.trim()
                  ? t("common.nothingMatches", { query: query.trim() })
                  : t("files.nothingInCategory")
              }
              title={t("common.noMatches")}
            />
          ) : (
            <EmptyState
              action={
                <Button onClick={() => void handleAdd()}>
                  <Plus className="h-4 w-4" />
                  {t("files.add")}
                </Button>
              }
              description={t("files.emptyBody")}
              title={t("files.emptyTitle")}
            />
          )
        ) : (
          <>
            <div
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
              ref={scrollRef}
            >
              {invalid.length > 0 ? (
                <section className="shrink-0">
                  <button
                    aria-controls={invalidListId}
                    aria-expanded={invalidOpen}
                    className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setInvalidOpen((open) => !open)}
                    type="button"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform",
                        invalidOpen && "rotate-90",
                      )}
                    />
                    {t("files.invalidSection", { count: invalid.length })}
                  </button>
                  {invalidOpen ? (
                    <ul
                      className={cn(FILE_GRID_CLASS, "mt-2")}
                      id={invalidListId}
                    >
                      {invalid.map((file) =>
                        renderTile(
                          file,
                          invalid.map((item) => item.id),
                        ),
                      )}
                    </ul>
                  ) : null}
                </section>
              ) : null}
              {pageFiles.length > 0 ? (
                <ul
                  // Fills the rest of the pane so a drop below the last tile still counts as in the list.
                  className={cn(FILE_GRID_CLASS, "flex-1")}
                >
                  {pageFiles.map((file) =>
                    renderTile(
                      file,
                      pageFiles.map((item) => item.id),
                    ),
                  )}
                </ul>
              ) : null}
            </div>
            {valid.length > FILES_PER_PAGE ? (
              <div className="shrink-0 border-t border-border px-4 py-2">
                <Pagination
                  onPageChange={goToPage}
                  page={page}
                  pageSize={FILES_PER_PAGE}
                  total={valid.length}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <DetailModal
        actions={
          viewing && (
            <>
              <Button
                onClick={() => setPendingDelete(viewing)}
                type="button"
                variant="destructive"
              >
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
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
              <Button
                onClick={() => void handleSaveCopy(viewing)}
                type="button"
                variant="outline"
              >
                <Download className="h-4 w-4" />
                {t("files.saveCopy")}
              </Button>
              {previewKind(viewing) ? (
                <Button onClick={() => setPreviewing(viewing)} type="button">
                  <Eye className="h-4 w-4" />
                  {t("files.preview")}
                </Button>
              ) : null}
            </>
          )
        }
        ariaLabel={viewing?.title ?? t("files.details")}
        onClose={() => setViewing(null)}
        open={viewing !== null}
        title={viewing?.title ?? ""}
      >
        {viewing && <FileDetailView item={viewing} />}
      </DetailModal>

      {previewing ? (
        <FileViewer
          files={previewList}
          initialIndex={previewList.findIndex(
            (file) => file.id === previewing.id,
          )}
          onClose={() => setPreviewing(null)}
          onSaveCopy={(file) => void handleSaveCopy(file)}
        />
      ) : null}

      <ConfirmDeleteDialog
        itemName={pendingDelete?.title ?? ""}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete);
        }}
        open={pendingDelete !== null}
      />
    </div>
  );
}

export function FileDetailView({ item }: { item: FileEntry }) {
  const { t } = useT();
  return (
    <DetailModalBody>
      <DetailFields>
        <DetailField
          label={t("files.date")}
          value={formatDate(dateInputToIso(item.date))}
        />
        <DetailField label={t("files.size")} value={formatBytes(item.size)} />
        <DetailField label={t("field.category")} value={item.category} />
        {item.invalid ? (
          <DetailField label={t("files.status")} value={t("files.invalid")} />
        ) : null}
        <DetailField
          className="col-span-2"
          label={t("files.fileName")}
          value={item.fileName}
        />
        <DetailField
          className="col-span-2"
          label={t("field.description")}
          value={item.description || t("common.empty")}
        />
      </DetailFields>
    </DetailModalBody>
  );
}

export function FileEditView({
  item,
  onSave,
  onCancel,
}: {
  item: FileEntry;
  onSave: (item: FileEntry) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const { categoryOptions } = useTaxonomySettings();
  const [form, setForm] = useState<FileFormInput>(() => formFromFile(item));
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FileFormInput>(
    key: K,
    value: FileFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateFileInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    onSave(updateFileEntry(item, form, new Date().toISOString()));
  }

  return (
    <ItemFormShell
      cancelLabel={t("common.cancel")}
      description={`${item.fileName} · ${formatBytes(item.size)}`}
      error={error}
      mode="edit"
      onCancel={onCancel}
      onSubmit={submit}
      title={t("files.edit")}
    >
      <div className="col-span-2 grid grid-cols-4 gap-4">
        <label className="col-span-2 space-y-1 text-sm font-medium">
          {t("field.title")}
          <Input
            aria-label={t("files.titleLabel")}
            onChange={(event) => update("title", event.target.value)}
            value={form.title}
          />
        </label>
        <label className="col-span-1 space-y-1 text-sm font-medium">
          {t("field.category")}
          <CategorySelect
            aria-label={t("files.categoryLabel")}
            onChange={(event) => update("category", event.target.value)}
            options={categoryOptions}
            value={form.category}
          />
        </label>
        <div className="col-span-1 space-y-1 text-sm font-medium">
          {t("files.date")}
          <DatePicker
            aria-label={t("files.dateLabel")}
            onChange={(value) => update("date", value)}
            value={form.date}
          />
        </div>
      </div>
      <label className="col-span-2 space-y-1 text-sm font-medium">
        {t("field.description")}
        <textarea
          aria-label={t("files.descriptionLabel")}
          className="min-h-28 w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => update("description", event.target.value)}
          value={form.description}
        />
      </label>
      <div className="col-span-2 flex items-start gap-3 text-sm">
        <Switch
          aria-label={t("files.invalidLabel")}
          checked={form.invalid}
          onCheckedChange={(checked) => update("invalid", checked)}
        />
        <div>
          <p className="font-medium">{t("files.invalid")}</p>
          <p className="text-xs text-muted-foreground">
            {t("files.invalidHint")}
          </p>
        </div>
      </div>
    </ItemFormShell>
  );
}
