# Contributing to OwnKeep

Thanks for looking. OwnKeep is a solo, spec-driven project, and it's deliberately opinionated — this
page tells you what that means for a contribution so you don't spend an evening on something I can't
merge.

## Before you write code

**Open an issue or a discussion first** for anything beyond a typo or an obvious bug fix. OwnKeep is
built against a written spec and a phased plan, and a PR that conflicts with them gets closed no
matter how good the code is. A five-minute issue saves that.

Read, in this order:

1. [`.cursor/rules/core-development-principles.mdc`](.cursor/rules/core-development-principles.mdc) — KISS, DRY, YAGNI, declarative-over-imperative, SRP.
2. [`spec.md`](spec.md) — what OwnKeep is and why. Section 1 lists the six design principles in priority order.
3. [`plan.md`](plan.md) — the phased build order and where the project currently stands.
4. [`AGENTS.md`](AGENTS.md) — the guardrail, applying to humans and AI agents alike.

## The non-negotiables

These come from `spec.md` and are not up for negotiation in a PR. A change that breaks one of them
will be declined:

- **Offline-only.** No network access at runtime, no telemetry, no analytics, no crash reporting, no auto-update pings.
- **Secrets stay in the Rust core.** Secret values never enter the WebView.
- **One encrypted file.** No database, no secondary on-disk store. (The single flagged exception is the device-local Touch ID key in the macOS Keychain — see `spec.md` §4.7.)
- **The feature-module registry architecture.** Features are self-contained modules; the core stays small.
- **Master password and recovery code are the only authoritative credentials.** No feature may create a fourth way in, or a way to be locked out.

## Setup

Prerequisites: macOS 13+, Node.js ≥ 20, pnpm 10 (`corepack enable`), stable Rust, Xcode Command Line
Tools, and `cargo install cargo-llvm-cov` for the Rust coverage gate.

```bash
pnpm install
pnpm dev
```

Development builds use a separate vault (`vault-dev.dat`) and a separate Keychain service, so you
cannot damage a real vault while hacking on OwnKeep.

## The bar for a PR

Every one of these must pass. They're enforced, not aspirational:

```bash
pnpm check          # typecheck + lint + format + frontend tests
pnpm coverage:all   # >95% line coverage on BOTH surfaces — a hard gate
cd src-tauri && cargo test
```

Also expected:

- **Keep pure logic separate from React views.** Module logic lives in plain `.ts` files so the highest-value tests need no DOM.
- **Crypto changes need property tests.** Anything touching `crypto.rs`, `envelope.rs`, or `container.rs` gets `proptest` coverage of the invariants before it merges.
- **Data-shape changes need a migration.** If you alter the vault or container shape, update the migration registry and the user-facing migration guide *in the same PR* (`spec.md` §11.2).
- **Documented behavior changes update the docs.** If your change alters what `spec.md` or `plan.md` describes, update them in the same PR.
- **Match the surrounding code.** Same naming, same comment density, same idioms.

## What I'm unlikely to merge

Not because the ideas are bad — because they're out of scope for this project:

- Cloud sync, accounts, or any server component.
- Browser extensions, autofill, or auto-type.
- Telemetry or analytics of any kind, however anonymous.
- A new runtime dependency that could have been thirty lines.
- Windows/Linux ports as a drive-by PR. I'm interested in the conversation — open a discussion, because it's an architectural decision, not a patch.

## Security issues

**Don't open a public issue.** See [SECURITY.md](SECURITY.md) for private reporting.

## Licensing

OwnKeep is GPL-3.0-or-later. By contributing, you agree your contribution ships under that license.
