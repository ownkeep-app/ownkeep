---
name: release
description: >-
  Build, sign, notarize, tag and publish an OwnKeep release to GitHub. Use only
  when the user explicitly invokes /release.
disable-model-invocation: true
---

Release OwnKeep. The user may name a version such as `1.6`; otherwise use `package.json`.

Follow the shared project skill exactly:

Read and execute every step in `.agents/skills/release/SKILL.md`.
