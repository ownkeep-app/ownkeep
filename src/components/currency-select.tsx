import { Select, type SelectProps } from "@/components/ui/select";

/** Supported currencies for user-editable currency fields (subscriptions + finance). */
export const CURRENCY_OPTIONS = ["CNY", "USD"] as const;
export type AppCurrency = (typeof CURRENCY_OPTIONS)[number];

/** Default for new forms and unset finance base currency. */
export const DEFAULT_CURRENCY: AppCurrency = "CNY";

export function CurrencySelect({
  "aria-label": ariaLabel,
  value,
  ...props
}: Omit<SelectProps, "children">) {
  const current =
    typeof value === "string" && value.trim()
      ? value.trim().toUpperCase()
      : DEFAULT_CURRENCY;
  const extras = !(CURRENCY_OPTIONS as readonly string[]).includes(current)
    ? [current]
    : [];

  return (
    <Select aria-label={ariaLabel} value={current} {...props}>
      {[...CURRENCY_OPTIONS, ...extras].map((currency) => (
        <option key={currency} value={currency}>
          {currency}
        </option>
      ))}
    </Select>
  );
}
