import type { Theme } from "@/vault/model";

export function shouldUseDarkTheme(
  theme: Theme,
  prefersDark: boolean,
): boolean {
  return theme === "dark" || (theme === "system" && prefersDark);
}

export function hexToHslToken(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return `0 0% ${percent(lightness)}%`;
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;

  return `${Math.round(hue * 60)} ${percent(saturation)}% ${percent(lightness)}%`;
}

export function applyThemeSettings(
  theme: Theme,
  accent: string,
  root: HTMLElement = document.documentElement,
  prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ??
    false,
): void {
  root.classList.toggle("dark", shouldUseDarkTheme(theme, prefersDark));
  const hsl = hexToHslToken(accent);
  if (!hsl) return;
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
}

function percent(value: number): number {
  return Math.round(value * 1000) / 10;
}
