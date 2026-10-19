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

Accepted delivery: source checks, build-script suite 251/251, actual minimal installer test, staged/package and final Setup verification passed. The project owner accepted the Setup on 2026-10-19 and authorized documentation updates, the About attribution text change to Code-OSS (MIT) 1.140.0, and commit/push to `codex/BeCoder_Next`. Detailed attempts and corrected test assumptions remain in the local validation ledger. The 2026-10-20 full rebuild below includes the subsequent About text change.


## 2026-10-20 full Setup rebuild

The owner requested a full source-to-Setup build, autonomous correction of failures, and commit/push to the corresponding branch. Product source baseline: `e8e59cc02a298f854d79bb3945877f3d44fe7871`. No product source fixes were needed. The owner separately confirmed removal of the three tracked `launch` skill files and requested including those deletions in this commit; these files are development tooling, not application payload.

| Check | Final result |
| --- | --- |
| `npm run typecheck-client` | exit 0; 13.267 s; 120 s external limit |
| `npm run compile-oi-extensions` | exit 0; 47.287 s; 120 s external limit |
| `npm --prefix build run typecheck` | exit 0 |
| `npm run test-build-scripts` | exit 0; 251/251 |
| `npm run gulp vscode-win32-x64-min` | exit 0; 173.324 s; 300 s external limit |
| Direct package verifier with `-IncludeCompiler $true` | exit 0 |
| `npm run gulp vscode-win32-x64-becoder-setup` | exit 0; 355.282 s including command startup |
| Elevated direct Setup verifier | exit 0; actual Portable/native installation, replacement/path protections, duplicate-native refusal, public shortcut/HKLM registration, and uninstall cleanup |

The bundled workbench contains `Roots in Code-OSS (MIT) 1.140.0 & growth under GPL 3.0`; the direct installer verification also compares installed payload against the staged application. No installed editor was launched, and this rebuild does not assert a new GUI/runtime acceptance.

Artifact: `.build/win32-x64/becoder-setup/BeCoderSetup-x64-2.0.0-beta.exe`, 173106214 bytes. SHA256: `D4411B9A680D7EB87294F939D18761ACCA373D779A5526056E549BCDBF175A8A`. The Setup is a local ignored build artifact; this branch publication does not create a tag or GitHub Release. Detailed commands and logs are in local ignored `tmp/setup-build-2026-10-20/`.
