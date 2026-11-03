import { DetailModal } from "@/components/DetailModal";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { ImportPlan } from "./import";
import { tagTypeLabel } from "./logic";

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
  const { t, tp } = useT();
  const importable = plan !== null && plan.added + plan.updated > 0;
  const hiddenIssues = (plan?.issues.length ?? 0) - MAX_ISSUES_SHOWN;

  return (
    <DetailModal
      actions={
        <>
          <Button onClick={onCancel} type="button" variant="outline">
            {t("common.cancel")}
          </Button>
          <Button
            className="ml-auto"
            disabled={!importable}
            onClick={() => plan && onConfirm(plan)}
            type="button"
          >
            {t("events.import")}
          </Button>
        </>
      }
      ariaLabel={t("events.importCsv")}
      onClose={onCancel}
      open={plan !== null}
      title={t("events.importCsv")}
    >
      {plan ? (
        <div className="space-y-3 p-5 text-sm">
          <p>
            {tp("events.importNewDays", plan.added)}
            {t("events.listSeparator")}
            {tp("events.importUpdatedDays", plan.updated)}
          </p>
          {plan.newTags.length > 0 ? (
            <p>
              {t("events.importNewTags", {
                tags: plan.newTags
                  .map((tag) => `${tag.name} (${tagTypeLabel(tag.type)})`)
                  .join(", "),
              })}
            </p>
          ) : null}
          {plan.issues.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-destructive">
                {tp("events.importProblems", plan.issues.length)}
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {plan.issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => (
                  <li key={`${issue.line}-${issue.message}`}>
                    {t("events.importIssue", {
                      line: issue.line,
                      message: issue.message,
                    })}
                  </li>
                ))}
                {hiddenIssues > 0 ? (
                  <li>
                    {t("events.importMoreIssues", { count: hiddenIssues })}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("events.importHelp")}
          </p>
        </div>
      ) : null}
    </DetailModal>
  );
}
