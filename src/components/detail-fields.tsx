import type { ReactNode } from "react";

import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

export function DetailModalBody({ children }: { children: ReactNode }) {
  return <div className="p-6">{children}</div>;
}

export function DetailModalHero({ children }: { children: ReactNode }) {
  return <div className="mb-5">{children}</div>;
}

export function DetailFields({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-4">{children}</div>;
}

export function DetailField({
  label,
  value,
  className,
  children,
}: {
  label: string;
  value?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      {children ?? <p className="mt-1 break-words text-sm">{value}</p>}
    </div>
  );
}

export function DetailUrlField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  if (!value) {
    return <DetailField className={className} label={label} value="-" />;
  }

  return (
    <div className={className}>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <button
        className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-left text-sm text-primary hover:underline"
        onClick={() => openExternalUrl(value)}
        type="button"
      >
        <span className="truncate">{value}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </button>
    </div>
  );
}

export function DetailFieldSpan({
  label,
  value,
  className,
  children,
}: {
  label: string;
  value?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <DetailField
      className={cn("col-span-2", className)}
      label={label}
      value={value}
    >
      {children}
    </DetailField>
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
