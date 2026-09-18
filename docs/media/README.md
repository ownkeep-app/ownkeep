# Media assets

Screenshots used by the root README. They are the same images the website serves from
`ownkeep.app/shots/`, so the two stay visually consistent — if you regenerate one, replace it in both
places.

```
docs/media/
├── icon.png              app icon, 256×256
└── shots/                WebP stills (dark theme, default #5B6CFF accent) plus the hero recording
    ├── command-bar.avif        README hero — silent 8.2s recording, 1280×960, autoplays and loops
    ├── command-bar.gif         fallback for the hero where AVIF isn't rendered
    ├── command-bar.webp        still of the command bar, and what the website serves
    ├── commands.webp           Commands module, git snippets by category
    ├── passwords.webp          Passwords module (hero on ownkeep.app)
    ├── todos.webp              Todos module
    ├── notes.webp              Notes module (v1.3)
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
one set rather than a pile. `⌘⇧4` then `Space` captures a window with its shadow. Encode to WebP
the same way the website does (max width 1880 for the passwords hero, 1500 for module shots, quality
78) and copy the result here and to the site's `/shots/` directory.

## The hero recording

The hero is a silent 8.2 s recording — hotkey, filter, copy. Motion shows the one thing a still
cannot: that the fill-in step exists at all. It ships in two formats behind a `<picture>`, because
GitHub will not autoplay or loop a `<video>` no matter how it's hosted:

| File | Size | Notes |
|---|---|---|
| `command-bar.avif` | 685 KB | 1280×960, 15 fps, AV1. Autoplays and loops like a GIF. Served to anything that supports it. |
| `command-bar.gif` | 2.9 MB | 800×600, 10 fps. The `<img>` fallback inside the `<picture>`. |

Regenerate from the master recording (`ownkeep-docs/hotkey video.mp4`, 1280×960 H.264):

```bash
ffmpeg -i "hotkey video.mp4" -an -vf "fps=15,scale=1280:-2:flags=lanczos" \
  -c:v libsvtav1 -crf 30 -preset 6 command-bar.avif
```

**Don't bother with animated WebP for this clip** — measured, not assumed. Because the footage is a
detailed photographic wallpaper, the best WebP encode (`img2webp -min_size -lossy -q 70`) landed at
2.1 MB and took over five minutes, barely beating the GIF; AVIF's AV1 inter-frame compression is
worth roughly 4× here. WebP stays the right choice for the stills.

If you re-record: 8–12 seconds, no audio, loop cleanly, and capture at 2× so it survives downscaling.
The GIF fallback is only 800px wide and displays at 760, so it has no Retina headroom — regenerate it
from the master too if you care.
