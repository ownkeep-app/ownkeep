import type { ReactNode } from "react";

/** Centered single-column layout shared by the auth / onboarding screens. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        {children}
      </div>
    </main>
  );
}
