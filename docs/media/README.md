# Media assets

Screenshots used by the root README. They are the same images the website serves from
`ownkeep.app/shots/`, so the two stay visually consistent — if you regenerate one, replace it in both
places.

```
docs/media/
├── icon.png              app icon, 256×256
└── shots/                compressed WebP (dark theme, default #5B6CFF accent, fictional data)
    ├── command-bar.webp        README hero, animated: hotkey, filter, copy
    ├── files.webp              Files module, identity and legal documents (specimens)
    ├── passwords.webp          Passwords module
    ├── commands.webp           Commands module
    ├── todos.webp              Todos module
    ├── notes.webp              Notes module
    ├── subscriptions.webp      Subscriptions module
    ├── finance.webp            Finance module
    ├── events.webp             Event Tracker, calendar view
    ├── events-timeline.webp    Event Tracker, timeline view
    ├── events-trending.webp    Event Tracker, trend chart
    ├── backup.webp             Backup and restore panel
    ├── language.webp           System settings in Simplified Chinese
    ├── drag-sort.webp          A tile mid-drag in the Files grid
    ├── pagination.webp         Page controls on the Passwords list
    ├── change-password.webp    Change master password form
    ├── lock-screen.webp        Lock screen: master password + Touch ID
    ├── touch-id.webp           macOS Touch ID prompt
    ├── settings.webp           Settings: modules, hotkeys, categories, tags
    ├── settings-system.webp    System settings: security, vault file, backup, Emergency Kit
    └── about-dialog.webp       About dialog (not currently used in the README)
```

## Recapturing

**Use a separate demo vault with fictional data.** A development build still reads your own
`vault-dev.dat`, so don't capture from it if that holds anything real: run a build with its own
`identifier` instead, which gives it an empty data folder. Never publish a screenshot of a real
vault, not even a dev one. Masked passwords still leak site names, usernames, IP addresses and your
actual subscriptions, and so does every frame of a recording.

Keep the set consistent — same theme, same accent, same window size — so the README tables read as
one set rather than a pile. `⌘⇧4` then `Space` captures a window with its shadow. Encode to WebP
the same way the website does (quality 78; the site uses 2200 wide for full-width shots and 1100 for
half-column ones, and this folder keeps module shots at 1500) and copy the result here and to the site's `/shots/` directory.

## The hero recording

`command-bar.webp` is an animated WebP: the bar opening, a search being typed, and the copied toast.
It's assembled from window captures rather than a screen recording, so it has no wallpaper to carry
and stays around 130 KB. Build it with `sharp`, joining the frames with `join: { animated: true }`,
and hold the first and last frames longer so the loop reads clearly.
