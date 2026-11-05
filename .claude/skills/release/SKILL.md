---
name: release
description: Build, sign, notarize, tag and publish an OwnKeep release to GitHub. Use only when the user explicitly invokes /release.
argument-hint: "[version, e.g. 1.6]"
disable-model-invocation: true
---

Release OwnKeep.

Version (optional; defaults to `package.json`):

```
$ARGUMENTS
```

Follow the shared project skill exactly:

Read and execute every step in `.agents/skills/release/SKILL.md`.
