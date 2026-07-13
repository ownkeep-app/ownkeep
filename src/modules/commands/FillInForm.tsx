import { type FormEvent, type KeyboardEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fillTemplate, parsePlaceholders } from "./logic";
import type { CommandArgument } from "./types";

/**
 * Interactive fill-in for `{{ }}` placeholders (spec §6/F2, §7.3): one field per unique
 * placeholder (enum → dropdown), native Tab/Shift-Tab between fields, Enter copies the
 * completed text, Opt/Alt+Enter copies the raw template. Side effects live in callbacks.
 */
export function FillInForm({
  title,
  template,
  arguments: args = [],
  onComplete,
  onRaw,
  onCancel,
}: {
  title: string;
  template: string;
  arguments?: CommandArgument[];
  onComplete: (filled: string) => void;
  onRaw: () => void;
  onCancel: () => void;
}) {
  const placeholders = useMemo(() => parsePlaceholders(template), [template]);
  const argByName = useMemo(
    () => new Map(args.map((arg) => [arg.name, arg])),
    [args],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(placeholders.map((name) => [name, ""])),
  );

  const preview = fillTemplate(template, values);

  function setValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onComplete(preview);
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // Opt/Alt+Enter copies the raw template with placeholders intact (§7.3).
    if (event.altKey && event.key === "Enter") {
      event.preventDefault();
      onRaw();
    }
  }

  return (
    <form
      className="flex flex-col gap-3 p-4"
      onKeyDown={onKeyDown}
      onSubmit={submit}
    >
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{template}</p>
      </div>

      {placeholders.map((name, index) => {
        const arg = argByName.get(name);
        const isEnum =
          arg?.type === "enum" && arg.values && arg.values.length > 0;
        return (
          <label className="grid gap-1 text-sm" key={name}>
            <span className="font-medium">{name}</span>
            {isEnum ? (
              <Select
                aria-label={name}
                autoFocus={index === 0}
                onChange={(event) => setValue(name, event.target.value)}
                value={values[name]}
              >
                <option value="">{`Select ${name}`}</option>
                {arg!.values!.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                aria-label={name}
                autoFocus={index === 0}
                onChange={(event) => setValue(name, event.target.value)}
                value={values[name]}
              />
            )}
          </label>
        );
      })}

      <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
        {preview}
      </pre>

      <div className="flex gap-2">
        <Button type="submit">Copy</Button>
        <Button onClick={onRaw} type="button" variant="outline">
          Copy raw
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
