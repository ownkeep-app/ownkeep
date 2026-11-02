import { DetailModal } from "@/components/DetailModal";
import { Button } from "@/components/ui/button";
import type { ImportPlan } from "./import";

/** Issues beyond this are summarised as a count so a messy file can't flood the dialog. */
const MAX_ISSUES_SHOWN = 8;

/** Preview of a planned CSV import; nothing is saved until Import is pressed. */
export function CsvImportDialog({
  plan,
  onCancel,
  onConfirm,
}: {
  plan: ImportPlan | null;
  onCancel: () => void;
  onConfirm: (plan: ImportPlan) => void;
}) {
  const importable = plan !== null && plan.added + plan.updated > 0;
  const hiddenIssues = (plan?.issues.length ?? 0) - MAX_ISSUES_SHOWN;

  return (
    <DetailModal
      actions={
        <>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            className="ml-auto"
            disabled={!importable}
            onClick={() => plan && onConfirm(plan)}
            type="button"
          >
            Import
          </Button>
        </>
      }
      ariaLabel="Import CSV"
      onClose={onCancel}
      open={plan !== null}
      title="Import CSV"
    >
      {plan ? (
        <div className="space-y-3 p-5 text-sm">
          <p>
            <span className="font-medium">{plan.added}</span> new{" "}
            {plan.added === 1 ? "day" : "days"},{" "}
            <span className="font-medium">{plan.updated}</span> existing{" "}
            {plan.updated === 1 ? "day" : "days"} updated.
          </p>
          {plan.newTags.length > 0 ? (
            <p>
              New tags:{" "}
              {plan.newTags
                .map((tag) => `${tag.name} (${tag.type})`)
                .join(", ")}
            </p>
          ) : null}
          {plan.issues.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-destructive">
                {plan.issues.length}{" "}
                {plan.issues.length === 1 ? "problem" : "problems"}
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {plan.issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => (
                  <li key={`${issue.line}-${issue.message}`}>
                    Line {issue.line}: {issue.message}
                  </li>
                ))}
                {hiddenIssues > 0 ? <li>…and {hiddenIssues} more</li> : null}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Columns: <code>date</code> (YYYY-MM-DD), one column per tag name,
            optional <code>note</code> and <code>milestone</code> (Y/N). Values
            in the file replace that tag's value on the same day; notes are
            appended.
          </p>
        </div>
      ) : null}
    </DetailModal>
  );
}
