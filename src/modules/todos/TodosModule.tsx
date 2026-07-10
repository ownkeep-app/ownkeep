import { type FormEvent, useMemo, useState } from "react";

import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ActionsTableHead,
  SortableTableHead,
} from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ButtonGroup,
  type ButtonGroupOption,
} from "@/components/ui/button-group";
import {
  nextSortState,
  stableSortBy,
  type SortState,
  type SortValue,
} from "@/lib/table-sort";
import { useTaxonomySettings } from "@/hooks/use-taxonomy-settings";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import {
  createTodoEntry,
  emptyTodoForm,
  formatDateTime,
  formFromTodo,
  sortTodos,
  todoEntries,
  updateTodoEntry,
  validateTodoInput,
} from "./logic";
import {
  TODO_PRIORITIES,
  TODO_RECURRENCES,
  type TodoEntry,
  type TodoFormInput,
} from "./types";

type TodoStatusFilter = "undone" | "done" | "all";

const TODO_STATUS_FILTERS: ButtonGroupOption<TodoStatusFilter>[] = [
  { value: "undone", label: "Undone" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

export function TodosListView({ items }: ListViewProps<TodoEntry>) {
  const saveTodo = useVaultStore((s) => s.saveTodo);
  const deleteTodo = useVaultStore((s) => s.deleteTodo);
  const toggleTodoDone = useVaultStore((s) => s.toggleTodoDone);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TodoStatusFilter>("undone");
  const [viewing, setViewing] = useState<TodoEntry | null>(null);
  const [editing, setEditing] = useState<TodoEntry | null | undefined>();
  const [sortState, setSortState] = useState<SortState<TodoSortColumn> | null>({
    column: "due",
    direction: "asc",
  });

  const todos = useMemo(() => todoEntries(items), [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = sortTodos(todos);
    const byStatus =
      statusFilter === "all"
        ? sorted
        : sorted.filter((item) =>
            statusFilter === "done" ? item.done : !item.done,
          );
    const visible = term
      ? byStatus.filter((item) =>
          [
            item.title,
            item.notes,
            item.priority,
            item.recurrence,
            item.category,
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : byStatus;
    return sortState
      ? stableSortBy(visible, sortState, todoSortValue)
      : visible;
  }, [todos, query, sortState, statusFilter]);
  const handleSort = (column: TodoSortColumn) =>
    setSortState((current) => nextSortState(current, column));
  const openCount = todos.filter((item) => !item.done).length;

  const startCreate = () => setEditing(null);

  async function handleSave(entry: TodoEntry) {
    await saveTodo(entry);
    setViewing(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteTodo(id);
    if (viewing?.id === id) setViewing(null);
  }

  async function handleToggle(id: string, done: boolean) {
    const item = todos.find((todo) => todo.id === id);
    if (!item || item.done === done) return;
    await toggleTodoDone(id);
    const slice = useVaultStore.getState().model?.modules.todos;
    const updated = Array.isArray(slice)
      ? todoEntries(slice).find((todo) => todo.id === id)
      : undefined;
    if (updated) {
      setViewing((current) => (current?.id === id ? updated : current));
    }
  }

  if (editing !== undefined) {
    return (
      <TodoEditView
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
          <h1 className="text-lg font-semibold">Todos</h1>
          <p className="text-sm text-muted-foreground">
            {openCount} open of {todos.length}
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <ButtonGroup
            aria-label="Todo status"
            onValueChange={setStatusFilter}
            options={TODO_STATUS_FILTERS}
            value={statusFilter}
          />
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Filter todos"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter todos"
              value={query}
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          query.trim() ? (
            <EmptyState
              title="No matches"
              description={`Nothing matches “${query.trim()}”.`}
            />
          ) : todos.length === 0 ? (
            <EmptyState
              title="No todos yet"
              description="Add a task — set a due time to get reminders."
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  New todo
                </Button>
              }
            />
          ) : statusFilter === "done" ? (
            <EmptyState
              title="No done todos"
              description="Completed tasks will show here."
            />
          ) : (
            <EmptyState title="No undone todos" description="All caught up." />
          )
        ) : (
          <Table className="table-fixed" wrapperClassName="min-h-0 flex-1">
            <TableHeader className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
              <TableRow>
                <SortableTableHead
                  className="w-14 px-4"
                  column="done"
                  label="Done"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[28%] px-4"
                  column="title"
                  label="Title"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[20%] px-4"
                  column="due"
                  label="Due"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[14%] px-4"
                  column="priority"
                  label="Priority"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[18%] px-4"
                  column="category"
                  label="Category"
                  onSort={handleSort}
                  sort={sortState}
                />
                <ActionsTableHead className="w-32 px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow
                  className="border-b border-border hover:bg-accent/40"
                  key={item.id}
                >
                  <TableCell className="px-4 py-3">
                    <Checkbox
                      aria-label={`Toggle ${item.title}`}
                      checked={item.done}
                      onCheckedChange={(checked) =>
                        void handleToggle(item.id, checked)
                      }
                    />
                  </TableCell>
                  <TableCell
                    className={
                      item.done
                        ? "truncate px-4 py-3 text-muted-foreground line-through"
                        : "truncate px-4 py-3 font-medium"
                    }
                  >
                    {item.title}
                  </TableCell>
                  <TableCell className="truncate px-4 py-3 text-muted-foreground">
                    {formatDateTime(item.dueAt)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <PriorityPill priority={item.priority} />
                  </TableCell>
                  <TableCell className="truncate px-4 py-3 text-muted-foreground">
                    {item.category || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        aria-label={`View ${item.title}`}
                        onClick={() => setViewing(item)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label={`Edit ${item.title}`}
                        onClick={() => setEditing(item)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label={`Delete ${item.title}`}
                        onClick={() => void handleDelete(item.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <DetailModal
          actions={
            viewing && (
              <>
                <Button
                  onClick={() => void handleToggle(viewing.id, !viewing.done)}
                  type="button"
                  variant="outline"
                >
                  {viewing.done ? "Mark open" : "Mark done"}
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
          {viewing && <TodoDetailView item={viewing} />}
        </DetailModal>
      </div>
    </div>
  );
}

type TodoSortColumn = "done" | "title" | "due" | "priority" | "category";

function todoSortValue(item: TodoEntry, column: TodoSortColumn): SortValue {
  if (column === "done") return item.done;
  if (column === "title") return item.title;
  if (column === "due") return item.dueAt ? Date.parse(item.dueAt) : null;
  if (column === "category") return item.category;
  return priorityRank[item.priority];
}

const priorityRank: Record<TodoEntry["priority"], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export function TodoDetailView({ item }: { item: TodoEntry }) {
  return (
    <DetailModalBody>
      <DetailModalHero>
        <p className="text-xs uppercase text-muted-foreground">Todo</p>
        <div className="mt-1 flex items-start gap-2">
          {item.done ? (
            <CheckCircle2 className="mt-1 h-4 w-4 text-primary" />
          ) : (
            <Circle className="mt-1 h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="min-w-0 flex-1 text-lg font-semibold">{item.title}</h2>
        </div>
      </DetailModalHero>
      <DetailFields>
        <DetailField label="Status" value={item.done ? "Done" : "Open"} />
        <DetailField label="Due" value={formatDateTime(item.dueAt)} />
        <DetailField
          label="Reminder"
          value={`${item.notifyLeadMinutes} minutes before due`}
        />
        <DetailField label="Priority" value={item.priority} />
        <DetailField label="Category" value={item.category} />
        <DetailField label="Recurrence" value={item.recurrence} />
        <DetailField
          label="Updated"
          value={new Date(item.updatedAt).toLocaleString()}
        />
        <DetailFieldSpan label="Notes" value={item.notes || "-"} />
      </DetailFields>
    </DetailModalBody>
  );
}

export function TodoEditView({
  item,
  onSave,
  onCancel,
}: {
  item?: TodoEntry;
  onSave: (item: TodoEntry) => void;
  onCancel: () => void;
}) {
  const { categoryOptions, taxonomy } = useTaxonomySettings();
  const [form, setForm] = useState<TodoFormInput>(() =>
    item ? formFromTodo(item) : emptyTodoForm(taxonomy),
  );
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof TodoFormInput>(
    key: K,
    value: TodoFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateTodoInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    const now = new Date().toISOString();
    onSave(
      item ? updateTodoEntry(item, form, now) : createTodoEntry(form, now),
    );
  }

  return (
    <ItemFormShell
      cancelLabel="Cancel"
      description="Add a due time to receive scheduler reminders."
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={item ? "Edit todo" : "New todo"}
    >
      <label className="col-span-2 space-y-1 text-sm font-medium">
        Title
        <Input
          aria-label="Todo title"
          onChange={(event) => update("title", event.target.value)}
          value={form.title}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Due
        <div className="relative">
          <CalendarClock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Todo due"
            className="pl-9"
            onChange={(event) => update("dueAt", event.target.value)}
            type="datetime-local"
            value={form.dueAt}
          />
        </div>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Reminder lead
        <Input
          aria-label="Todo reminder lead minutes"
          min={0}
          onChange={(event) => update("notifyLeadMinutes", event.target.value)}
          type="number"
          value={form.notifyLeadMinutes}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Priority
        <Select
          aria-label="Todo priority"
          onChange={(event) =>
            update("priority", event.target.value as TodoFormInput["priority"])
          }
          value={form.priority}
        >
          {TODO_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Recurrence
        <Select
          aria-label="Todo recurrence"
          onChange={(event) =>
            update(
              "recurrence",
              event.target.value as TodoFormInput["recurrence"],
            )
          }
          value={form.recurrence}
        >
          {TODO_RECURRENCES.map((recurrence) => (
            <option key={recurrence} value={recurrence}>
              {recurrence}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Category
        <CategorySelect
          aria-label="Todo category"
          onChange={(event) => update("category", event.target.value)}
          options={categoryOptions}
          value={form.category}
        />
      </label>
      <label className="col-span-2 space-y-1 text-sm font-medium">
        Notes
        <textarea
          aria-label="Todo notes"
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => update("notes", event.target.value)}
          value={form.notes}
        />
      </label>
    </ItemFormShell>
  );
}

function PriorityPill({ priority }: { priority: TodoEntry["priority"] }) {
  const label = priority[0].toUpperCase() + priority.slice(1);
  return (
    <span className="inline-flex rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}
