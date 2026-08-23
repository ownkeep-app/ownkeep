# Media assets

Screenshots used by the root README. They are the same images the website serves from
`ownkeep.app/shots/`, so the two stay visually consistent — if you regenerate one, replace it in both
places.

```
docs/media/
├── icon.png              app icon, 256×256
└── shots/                1500×936 WebP, dark theme, default #5B6CFF accent
    ├── command-bar.webp        README hero — "git re" ranked results with placeholders
    ├── commands.webp           Commands module, git snippets by category
    ├── passwords.webp          Passwords module
    ├── todos.webp              Todos module
    ├── subscriptions.webp      Subscriptions module
    ├── finance.webp            Finance module
    ├── lock-screen.webp        Lock screen: master password + Touch ID
    ├── touch-id.webp           macOS Touch ID prompt
    ├── settings.webp           Settings: modules, hotkeys, categories, tags
    ├── settings-system.webp    System settings: security, vault file, backup, Emergency Kit
    └── about-dialog.webp       About dialog (not currently used in the README)
```

## Recapturing

**Use throwaway data.** Capture against a development build — `pnpm dev` writes `vault-dev.dat`, so
your real vault stays untouched. Never publish a screenshot of a real vault: even masked passwords
leak site names, usernames, and your actual subscriptions.

Keep the set consistent — same theme, same accent, same window size — so the README tables read as
one set rather than a pile. `⌘⇧4` then `Space` captures a window with its shadow; export to WebP at
1500×936.

## Worth adding later

A short **animated GIF** of the command bar would outperform the still hero: `⌘⇧Space` → type → pick a
command with `{{placeholder}}` markers → fill in the values → "copied" toast. 8–12 seconds, no
titles, looping cleanly, recorded with Kap or Gifski at 2× and downscaled to 1440px / under 5 MB.

Motion shows the one thing a still cannot: that the fill-in step exists at all. Swap it into the hero
slot in the root README when you have it, and keep `command-bar.webp` as the fallback.
