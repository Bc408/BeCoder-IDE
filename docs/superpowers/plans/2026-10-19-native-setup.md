# Native Setup Implementation Plan

> **For agentic workers:** Use executing-plans to implement the approved design inline. The owner has already authorized implementation; do not request another approval.

**Goal:** Replace shortcut-specific elevation with Inno's administrative installation mode.

**Architecture:** Inno owns common shortcuts and machine uninstall registration. A small check against that registration rejects a second native destination or Portable replacement of the native installation.

**Tech Stack:** Inno Pascal Script, TypeScript Node tests, PowerShell verification, Gulp.

**Spec:** [Approved design](../specs/2026-10-19-native-setup-design.md)

## Global Constraints

No legacy migration, backup or cleanup of unrelated files. Commit and push were excluded during implementation; the owner explicitly authorized them after acceptance. Preserve existing data-loss and path protections. Continue in the owner's current feature checkout. Keep the current optional desktop behavior in both modes.

## Review Focus

- A second native destination must fail before creating files or altering the first registration.
- A Portable destination equal to the registered native directory must fail before deletion.
- Two Portable copies must coexist while Native is installed, without changing its shortcut/registration.
- Same-directory native replacement still requires consent and uninstalls cleanly afterward.
- Elevation with alternate credentials uses the elevated account's user folders; no custom original-user reconstruction is added.

### Task 1: Inno lifecycle and actual installer regression

**Files:** `build/win32/becoder.iss`, `build/gulpfile.vscode.win32.ts`, replace `build/lib/test/becoderShortcuts.test.ts` with `becoderSetup.test.ts`; delete `build/lib/becoderShortcuts.ts` and `build/win32/becoder-shortcuts.cpp`.

- [x] Write an actual minimal-Setup test using unique product names; assert HKLM registration, common shortcut, duplicate rejection, same-path consent and two Portable installations.
- [x] Run fixture and correct invalid manifest assumption; actual integration verified. See ledger for failed attempts.
- [x] Set admin privilege and fixed AppId, create common shortcut with native-only check, add registration-based destination restriction and remove helper integration.
- [x] Run fixture to green. Installer tests run in an elevated process; no GUI editor is launched.

### Task 2: Delivery verification and documentation

**Files:** `build/azure-pipelines/win32/verify-becoder-setup.ps1`, `README.md`, `README_cn.md`.

- [x] Update verifier for admin mode, HKLM registration, native Inno icon, helper absence and duplicate rejection. Remove backup/rename machinery; refuse existing integration instead.
- [x] Update both READMEs to the approved installation behavior.
- [x] Preflight exact validator entry points; record commands/results in `.superpowers/sdd/2026-10-19-native-setup/progress.md`.
- [x] Run focused installer test, build script tests relevant to changed owners, lint/parser/doc checks and required client/extension checks.
- [x] Build staged Windows app, verify package, build Setup and directly verify it. Stop on failures, fix within scope and rerun affected gates.
- [x] Review final diff and deliver Setup without committing. Owner observes startup UAC and performs manual acceptance.

Accepted delivery: source checks, build-script suite 251/251, actual minimal installer test, staged/package and final Setup verification passed. The project owner accepted the Setup on 2026-10-19 and authorized documentation updates, the About attribution text change to Code-OSS (MIT) 1.140.0, and commit/push to `codex/BeCoder_Next`. Detailed attempts and corrected test assumptions remain in the local validation ledger. The existing verified Setup predates the subsequent About-only text change; do not treat it as a rebuilt installer for that change.
