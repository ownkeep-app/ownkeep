/** Shared placeholder for a stubbed module's Dashboard pane, until the module's phase lands. */
export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <p className="text-lg font-medium text-foreground">{title}</p>
      <p className="text-sm">This module arrives in {phase}.</p>
    </div>
  );
}
