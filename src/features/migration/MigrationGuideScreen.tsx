import { useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Shield,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useVaultStore } from "@/stores/vault-store";
import type { ChangeKind, SchemaChange } from "@/vault/migrations";

const CHANGE_ORDER: ChangeKind[] = [
  "added",
  "renamed",
  "transformed",
  "removed",
];

const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: "Added silently",
  renamed: "Renamed",
  transformed: "Updated",
  removed: "Removed data",
};

/** User-aware schema migration gate shown after unlock and before any vault write. */
export function MigrationGuideScreen() {
  const migration = useVaultStore((s) => s.migration);
  const busy = useVaultStore((s) => s.busy);
  const error = useVaultStore((s) => s.error);
  const acceptMigration = useVaultStore((s) => s.acceptMigration);
  const backupMigrationAndQuit = useVaultStore((s) => s.backupMigrationAndQuit);
  const eraseVaultAndStartFresh = useVaultStore(
    (s) => s.eraseVaultAndStartFresh,
  );
  const quitApp = useVaultStore((s) => s.quitApp);
  const [confirmErase, setConfirmErase] = useState(false);

  if (!migration) return null;

  // The scroll container must be block-level with the bottom padding on the section: a flex
  // main stretches the section to screen height so content (and any padding after it) escapes
  // the box, and an overflow container's own padding-bottom is never rendered past overflow.
  return (
    <main className="h-screen overflow-auto bg-background px-6 pt-6 text-foreground">
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6">
        <header className="flex items-start gap-3">
          <Shield className="mt-1 h-5 w-5 text-primary" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold">Upgrade vault data</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {`This vault was last written by keystash v${migration.fromAppVersion}. The current app is v${migration.toAppVersion}. Review the migration guide before anything is written.`}
            </p>
          </div>
        </header>

        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />A
            pre-migration backup will be created automatically.
          </div>
          <p className="mt-2 text-muted-foreground">
            Schema v{migration.fromSchemaVersion} will be upgraded to schema v
            {migration.toSchemaVersion}. Migrations are forward-only, so older
            app builds will refuse this vault after you accept.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {CHANGE_ORDER.map((kind) => (
            <ChangeGroup key={kind} kind={kind} changes={migration.changes} />
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void acceptMigration()}>
            {busy ? "Working..." : "Accept & upgrade"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void backupMigrationAndQuit()}
          >
            <LogOut aria-hidden />
            Back up & quit
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void quitApp()}
          >
            Quit
          </Button>
        </div>

        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 text-destructive"
              aria-hidden
            />
            <div className="flex-1">
              <h2 className="text-sm font-medium text-destructive">
                Start fresh by erasing this vault
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This permanently removes the current vault file and returns to
                onboarding. Use this only if you are sure you do not need the
                old data.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {confirmErase ? (
                  <>
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void eraseVaultAndStartFresh()}
                    >
                      <Trash2 aria-hidden />
                      Erase all data
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmErase(false)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setConfirmErase(true)}
                  >
                    <Trash2 aria-hidden />
                    Erase & start fresh
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function IncompatibleVaultScreen() {
  const message = useVaultStore((s) => s.incompatibleMessage);
  const quitApp = useVaultStore((s) => s.quitApp);

  return (
    <main className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="flex max-w-md flex-col items-center gap-4 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
        <h1 className="text-xl font-semibold">Upgrade keystash</h1>
        <p className="text-sm text-muted-foreground">
          {message ||
            "This vault was written by a newer version of keystash. Please upgrade keystash to open it."}
        </p>
        <Button variant="outline" onClick={() => void quitApp()}>
          Quit
        </Button>
      </section>
    </main>
  );
}

function ChangeGroup({
  kind,
  changes,
}: {
  kind: ChangeKind;
  changes: SchemaChange[];
}) {
  const entries = changes.filter((change) => change.kind === kind);
  if (entries.length === 0) return null;

  const destructive = kind === "removed";

  return (
    <section
      className={
        destructive
          ? "rounded-md border border-destructive/40 bg-destructive/5 p-4"
          : "rounded-md border border-border bg-card p-4"
      }
    >
      <h2
        className={
          destructive
            ? "text-sm font-semibold text-destructive"
            : "text-sm font-semibold"
        }
      >
        {CHANGE_LABELS[kind]}
      </h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {entries.map((change) => (
          <li
            key={`${change.kind}:${change.path}`}
            className="flex flex-col gap-1"
          >
            <span
              className={
                destructive ? "font-medium text-destructive" : "font-medium"
              }
            >
              {change.newPath
                ? `${change.path} -> ${change.newPath}`
                : change.path}
            </span>
            <span className="text-muted-foreground">{change.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
