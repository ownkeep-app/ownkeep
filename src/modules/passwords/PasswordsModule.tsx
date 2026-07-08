import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import {
  Copy,
  Eye,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PasswordEntry | null | undefined>();

  const passwords = useMemo(() => passwordEntries(items), [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...passwords].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return sorted;
    return sorted.filter((item) =>
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
    );
  }, [passwords, query]);
  const selected =
    passwords.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  const startCreate = () => setEditing(null);

  async function handleSave(entry: PasswordEntry) {
    await savePassword(entry);
    setSelectedId(entry.id);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deletePassword(id);
    if (selectedId === id) setSelectedId(null);
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

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
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
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-background text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-4/12 px-4 py-2 font-medium" scope="col">
                      Name
                    </th>
                    <th className="w-3/12 px-4 py-2 font-medium" scope="col">
                      Username
                    </th>
                    <th className="w-2/12 px-4 py-2 font-medium" scope="col">
                      Password
                    </th>
                    <th className="w-3/12 px-4 py-2 font-medium" scope="col">
                      Tags
                    </th>
                    <th className="w-32 px-4 py-2 font-medium" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      className={
                        selected?.id === item.id
                          ? "border-b border-border bg-accent/60"
                          : "border-b border-border hover:bg-accent/40"
                      }
                      key={item.id}
                    >
                      <td className="truncate px-4 py-3">
                        <button
                          className="max-w-full truncate text-left font-medium"
                          onClick={() => setSelectedId(item.id)}
                          type="button"
                        >
                          {item.name}
                        </button>
                      </td>
                      <td className="truncate px-4 py-3 text-muted-foreground">
                        {item.username || "-"}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {MASKED_PASSWORD}
                      </td>
                      <td className="truncate px-4 py-3 text-muted-foreground">
                        {item.tags.join(", ") || "-"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="w-80 border-l border-border">
          {selected ? (
            <PasswordDetailView
              item={selected}
              onCopy={() => void handleCopy(selected.id)}
              onReveal={() => void handleReveal(selected.id)}
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Select a password to inspect its metadata.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
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
    <div className="space-y-5 p-6">
      <div>
        <p className="text-xs uppercase text-muted-foreground">Login</p>
        <h2 className="truncate text-lg font-semibold">{item.name}</h2>
        <p className="truncate text-sm text-muted-foreground">
          {item.username || "No username"}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Password</p>
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
      </div>
      <UrlRow label="Login URL" value={item.loginUrl} />
      <UrlRow label="Recovery URL" value={item.recoveryUrl} />
      <DetailRow label="Notes" value={item.notes || "-"} />
      <DetailRow label="Tags" value={item.tags.join(", ") || "-"} />
      <DetailRow
        label="Updated"
        value={new Date(item.updatedAt).toLocaleString()}
      />
    </div>
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

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-sm" : "break-words text-sm"}>
        {value}
      </p>
    </div>
  );
}

function UrlRow({ label, value }: { label: string; value: string }) {
  if (!value) return <DetailRow label={label} value="-" />;
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <button
        className="inline-flex max-w-full items-center gap-1 truncate text-left text-sm text-primary hover:underline"
        onClick={() => openExternalUrl(value)}
        type="button"
      >
        <span className="truncate">{value}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </button>
    </div>
  );
}

function openExternalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    }
  } catch {
    // Invalid URLs stay inert; the edit form keeps them visible for correction.
  }
}
