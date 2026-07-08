import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { Copy, Eye, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { DetailModal } from "@/components/DetailModal";
import {
  DetailField,
  DetailFields,
  DetailFieldSpan,
  DetailModalBody,
  DetailModalHero,
  DetailUrlField,
} from "@/components/detail-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toastError, toastSecretCopied } from "@/lib/toast";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import {
  emptyPasswordForm,
  formFromPassword,
  passwordEntries,
  validatePasswordInput,
  createPasswordEntry,
  updatePasswordEntry,
} from "./logic";
import {
  MASKED_PASSWORD,
  PASSWORD_SECRET_FIELD,
  type PasswordEntry,
  type PasswordFormInput,
} from "./types";

export function PasswordsListView({ items }: ListViewProps<PasswordEntry>) {
  const savePassword = useVaultStore((s) => s.savePassword);
  const deletePassword = useVaultStore((s) => s.deletePassword);
  const copySecret = useVaultStore((s) => s.copySecret);
  const revealSecret = useVaultStore((s) => s.revealSecret);
  const clearSeconds = useVaultStore(
    (s) => s.model?.settings.clipboardClearSeconds ?? 30,
  );
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<PasswordEntry | null>(null);
  const [editing, setEditing] = useState<PasswordEntry | null | undefined>();
  const [sortState, setSortState] =
    useState<SortState<PasswordSortColumn> | null>(null);

  const passwords = useMemo(() => passwordEntries(items), [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...passwords].sort((a, b) => a.name.localeCompare(b.name));
    const visible = term
      ? sorted.filter((item) =>
          [
            item.name,
            item.username,
            item.loginUrl,
            item.recoveryUrl,
            item.notes,
            item.tags.join(" "),
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : sorted;
    return sortState
      ? stableSortBy(visible, sortState, passwordSortValue)
      : visible;
  }, [passwords, query, sortState]);
  const handleSort = (column: PasswordSortColumn) =>
    setSortState((current) => nextSortState(current, column));

  const startCreate = () => setEditing(null);

  async function handleSave(entry: PasswordEntry) {
    await savePassword(entry);
    setViewing(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deletePassword(id);
    if (viewing?.id === id) setViewing(null);
  }

  async function handleCopy(id: string) {
    try {
      await copySecret(id, PASSWORD_SECRET_FIELD);
      toastSecretCopied(clearSeconds);
    } catch {
      toastError("Couldn't copy the password.");
    }
  }

  async function handleReveal(id: string) {
    try {
      await revealSecret(id, PASSWORD_SECRET_FIELD);
    } catch {
      toastError("Couldn't reveal the password.");
    }
  }

  if (editing !== undefined) {
    return (
      <PasswordEditView
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
          <h1 className="text-lg font-semibold">Passwords</h1>
          <p className="text-sm text-muted-foreground">
            {passwords.length} saved{" "}
            {passwords.length === 1 ? "login" : "logins"}
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
              aria-label="Filter passwords"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter passwords"
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
              title="No passwords yet"
              description="Add your first login to start filling the vault."
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  New password
                </Button>
              }
            />
          )
        ) : (
          <Table className="table-fixed" wrapperClassName="min-h-0 flex-1">
            <TableHeader className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
              <TableRow>
                <SortableTableHead
                  className="w-[28%] px-4"
                  column="name"
                  label="Name"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[26%] px-4"
                  column="username"
                  label="Username"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[14%] px-4"
                  column="password"
                  label="Password"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[14%] px-4"
                  column="tags"
                  label="Tags"
                  onSort={handleSort}
                  sort={sortState}
                />
                <ActionsTableHead className="w-36 px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow
                  className="border-b border-border hover:bg-accent/40"
                  key={item.id}
                >
                  <TableCell className="break-words px-4 py-3 font-medium whitespace-normal">
                    {item.name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {item.username || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-muted-foreground">
                    {MASKED_PASSWORD}
                  </TableCell>
                  <TableCell className="truncate px-4 py-3 text-muted-foreground">
                    {item.tags.join(", ") || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        aria-label={`View ${item.name}`}
                        onClick={() => setViewing(item)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label={`Copy password for ${item.name}`}
                        onClick={() => void handleCopy(item.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label={`Edit ${item.name}`}
                        onClick={() => setEditing(item)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label={`Delete ${item.name}`}
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
          title={viewing?.name ?? ""}
        >
          {viewing && (
            <PasswordDetailView
              item={viewing}
              onCopy={() => void handleCopy(viewing.id)}
              onReveal={() => void handleReveal(viewing.id)}
            />
          )}
        </DetailModal>
      </div>
    </div>
  );
}

type PasswordSortColumn = "name" | "username" | "password" | "tags";

function passwordSortValue(
  item: PasswordEntry,
  column: PasswordSortColumn,
): SortValue {
  if (column === "name") return item.name;
  if (column === "username") return item.username;
  if (column === "tags") return item.tags.join(", ");
  return MASKED_PASSWORD;
}

export function PasswordDetailView({
  item,
  onCopy,
  onReveal,
}: {
  item: PasswordEntry;
  onCopy?: () => void;
  onReveal?: () => void;
}) {
  return (
    <DetailModalBody>
      <DetailModalHero>
        <p className="text-xs uppercase text-muted-foreground">Login</p>
        <h2 className="break-words text-lg font-semibold">{item.name}</h2>
        <p className="truncate text-sm text-muted-foreground">
          {item.username || "No username"}
        </p>
      </DetailModalHero>
      <DetailFields>
        <DetailFieldSpan label="Password">
          <div className="mt-1 flex items-center gap-2">
            <p className="flex-1 font-mono text-sm">{MASKED_PASSWORD}</p>
            {onReveal && (
              <Button
                aria-label={`Reveal password for ${item.name}`}
                onClick={onReveal}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {onCopy && (
              <Button
                aria-label={`Copy password for ${item.name}`}
                onClick={onCopy}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DetailFieldSpan>
        <DetailUrlField label="Login URL" value={item.loginUrl} />
        <DetailUrlField label="Recovery URL" value={item.recoveryUrl} />
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

export function PasswordEditView({
  item,
  onSave,
  onCancel,
}: {
  item?: PasswordEntry;
  onSave: (item: PasswordEntry) => void;
  onCancel: () => void;
}) {
  const mode = item ? "edit" : "create";
  const [form, setForm] = useState<PasswordFormInput>(
    item ? formFromPassword(item) : emptyPasswordForm(),
  );
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof PasswordFormInput>(
    key: K,
    value: PasswordFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validatePasswordInput(form, mode);
    if (validation) {
      setError(validation);
      return;
    }
    const now = new Date().toISOString();
    onSave(
      item
        ? updatePasswordEntry(item, form, now)
        : createPasswordEntry(form, now),
    );
  }

  return (
    <form className="flex h-full flex-col" onSubmit={submit}>
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">
            {item ? "Edit password" : "New password"}
          </h1>
        </div>
        <Button
          aria-label="Cancel password edit"
          onClick={onCancel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid max-w-3xl gap-4 p-6">
        <Field label="Name">
          <Input
            aria-label="Password name"
            autoFocus
            onChange={(event) => update("name", event.target.value)}
            value={form.name}
          />
        </Field>
        <Field label="Username">
          <Input
            aria-label="Password username"
            onChange={(event) => update("username", event.target.value)}
            value={form.username}
          />
        </Field>
        <Field label={item ? "Password (leave blank to keep)" : "Password"}>
          <Input
            aria-label="Password value"
            onChange={(event) => update("password", event.target.value)}
            type="password"
            value={form.password}
          />
        </Field>
        <Field label="Login URL">
          <Input
            aria-label="Login URL"
            onChange={(event) => update("loginUrl", event.target.value)}
            value={form.loginUrl}
          />
        </Field>
        <Field label="Recovery URL">
          <Input
            aria-label="Recovery URL"
            onChange={(event) => update("recoveryUrl", event.target.value)}
            value={form.recoveryUrl}
          />
        </Field>
        <Field label="Tags">
          <Input
            aria-label="Password tags"
            onChange={(event) => update("tags", event.target.value)}
            placeholder="dev, work"
            value={form.tags}
          />
        </Field>
        <Field label="Notes">
          <textarea
            aria-label="Password notes"
            className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(event) => update("notes", event.target.value)}
            value={form.notes}
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
