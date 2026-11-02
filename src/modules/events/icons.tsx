import { useState } from "react";
import { Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TAG_ICON_KEYS, TAG_ICONS } from "./tag-icons";

export function TagIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = TAG_ICONS[icon] ?? Tag;
  return <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", className)} />;
}

/** Icon button that opens a grid of the curated tag icons. */
export function TagIconPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (icon: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button aria-label={label} size="icon" type="button" variant="outline">
          <TagIcon className="h-4 w-4" icon={value} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        // Portaled content still bubbles through the React tree; keep Escape from also
        // dismissing the surrounding form (Radix closes the popover in the capture phase).
        onKeyDown={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
      >
        <div
          aria-label={label}
          className="grid grid-cols-6 gap-1"
          role="radiogroup"
        >
          {TAG_ICON_KEYS.map((key) => (
            <button
              aria-checked={key === value}
              aria-label={key}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent",
                key === value &&
                  "bg-primary text-primary-foreground hover:bg-primary",
              )}
              key={key}
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              role="radio"
              type="button"
            >
              <TagIcon className="h-4 w-4" icon={key} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
