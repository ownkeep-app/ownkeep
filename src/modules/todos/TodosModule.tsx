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
  X,
} from "lucide-react";

import { DetailModal } from "@/components/DetailModal";
import {
  DetailField,
  DetailFields,
  DetailFieldSpan,
  DetailModalBody,
  DetailModalHero,
} from "@/components/detail-fields";
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
import { EmptyState } from "@/components/EmptyState";
import {
  nextSortState,
  stableSortBy,
  type SortState,
  type SortValue,
} from "@/lib/table-sort";
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

export function TodosListView({ items }: ListViewProps<TodoEntry>) {
  const saveTodo = useVaultStore((s) => s.saveTodo);
  const deleteTodo = useVaultStore((s) => s.deleteTodo);
  const toggleTodoDone = useVaultStore((s) => s.toggleTodoDone);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<TodoEntry | null>(null);
  const [editing, setEditing] = useState<TodoEntry | null | undefined>();
  const [sortState, setSortState] = useState<SortState<TodoSortColumn> | null>(
    null,
  );

  const todos = useMemo(() => todoEntries(items), [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = sortTodos(todos);
    const visible = term
      ? sorted.filter((item) =>
          [
            item.title,
            item.notes,
            item.priority,
            item.recurrence,
            item.tags.join(" "),
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : sorted;
    return sortState
      ? stableSortBy(visible, sortState, todoSortValue)
      : visible;
  }, [todos, query, sortState]);
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
        <div className="border-b border-border p-4">
          <label className="relative block">
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
          ) : (
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
                  column="tags"
                  label="Tags"
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
                    {item.tags.join(", ") || "-"}
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

type TodoSortColumn = "done" | "title" | "due" | "priority" | "tags";

function todoSortValue(item: TodoEntry, column: TodoSortColumn): SortValue {
  if (column === "done") return item.done;
  if (column === "title") return item.title;
  if (column === "due") return item.dueAt ? Date.parse(item.dueAt) : null;
  if (column === "tags") return item.tags.join(", ");
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
        <DetailField label="Recurrence" value={item.recurrence} />
        <DetailField label="Tags" value={item.tags.join(", ") || "-"} />
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
  const [form, setForm] = useState<TodoFormInput>(
    item ? formFromTodo(item) : emptyTodoForm(),
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
    <form className="flex h-full flex-col" onSubmit={submit}>
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">
            {item ? "Edit todo" : "New todo"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Add a due time to receive scheduler reminders.
          </p>
        </div>
        <Button
          aria-label="Cancel"
          onClick={onCancel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid flex-1 gap-4 overflow-auto p-6 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium md:col-span-2">
          Title
          <Input
            aria-label="Todo title"
            onChange={(event) => update("title", event.target.value)}
            value={form.title}
          />
        </label>
        <label className="space-y-1 text-sm font-medium md:col-span-2">
          Notes
          <textarea
            aria-label="Todo notes"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => update("notes", event.target.value)}
            value={form.notes}
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
            onChange={(event) =>
              update("notifyLeadMinutes", event.target.value)
            }
            type="number"
            value={form.notifyLeadMinutes}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Priority
          <Select
            aria-label="Todo priority"
            onChange={(event) =>
              update(
                "priority",
                event.target.value as TodoFormInput["priority"],
              )
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
        <label className="space-y-1 text-sm font-medium md:col-span-2">
          Tags
          <Input
            aria-label="Todo tags"
            onChange={(event) => update("tags", event.target.value)}
            value={form.tags}
          />
        </label>
        {error && (
          <p className="text-sm text-destructive md:col-span-2">{error}</p>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </footer>
    </form>
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
