# Media assets

The root README references the files below. **They must exist before the repository goes public** —
a README whose first screen is five broken images is worse than one with no images at all.

| File | What | Size |
|---|---|---|
| `icon.png` | App icon (already here) | 256×256 |
| `command-bar.gif` | The hero. Command bar in use | ≤ 1440px wide, ≤ 5 MB |
| `command-bar.png` | Still of the bar with ranked results | 2× Retina |
| `dashboard.png` | Dashboard: sidebar + a list view | 2× Retina |
| `lock-screen.png` | Lock screen with Touch ID button | 2× Retina |
| `settings.png` | Settings → Appearance or Security | 2× Retina |

## Before you capture

**Use throwaway data.** Create a fresh vault with `pnpm dev` (development builds use `vault-dev.dat`,
so your real vault is untouched) and populate it with plausible fake entries. Never publish a
screenshot of your real vault — even masked passwords leak site names, usernames, and your actual
subscriptions.

Set a clean stage: light theme with the default `#5B6CFF` accent, a neutral desktop background,
menu bar tidied, no notification badges.

## The GIF

This is the single highest-value asset in the repository — it's what decides whether someone stars.
Show the thing nothing else does: **fuzzy search → placeholder fill-in → copied**.

8–12 seconds, no titles, no music, loop cleanly:

1. Press `⌘⇧Space` — the bar appears over a real-looking desktop.
2. Type a few characters; results narrow, with the frecency-ranked one on top.
3. Pick a command with `{{placeholder}}` markers.
4. Fill in the values.
5. The "copied" toast confirms.

Record with Kap or Gifski at 2×, then downscale to 1440px and cap at 5 MB. Type at a natural pace —
too fast and nobody can follow what happened.

## Stills

`⌘⇧4` then `Space` captures a window with its shadow. Keep all four screenshots in the same theme
and the same window size so the README table reads as one set.
