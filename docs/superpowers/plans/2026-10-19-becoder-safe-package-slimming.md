# BeCoder Safe Package Slimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this approved scope inline. Steps use checkbox syntax for tracking.

**Goal:** Deliver a verified Windows x64 Setup that removes only the ten researched foreign 7zip files while retaining all current capabilities and diagnostics.

**Architecture:** Restore JSON client/server dependencies from their existing locks as a separate baseline operation. Add a target-specific, exact-path filter before ASAR creation and a direct package verifier that checks the five retained 7zip files against the source dependency. Compare the final package to the restored baseline; only the ten approved paths may disappear.

**Tech Stack:** TypeScript build streams, Node tests/ASAR, PowerShell package/Setup verifiers, existing Inno Setup 6.4.1.

**Spec:** `docs/superpowers/specs/2026-10-19-becoder-setup-size-research.md`, section 16, and its evidence JSON. Project owner authorized implementation on 2026-10-19.

## Global Constraints

- Preserve PDB, shared TypeScript, GCC/PCH/clangd, Electron, all feature resources, licenses and current compression parameters.
- Only win32-x64 is filtered. Other targets, unknown/new files and nested copies of 7zip-bin are retained.
- Preserve all existing dirty work, installation modes, data ownership, shortcuts, UAC handling and uninstall icon.
- No root npm install/ci, version/lock changes, manual generated-output pruning, GUI launch, Git commit or push.
- JSON baseline repair uses only the existing client/root and server project locks, with old inputs retained for rollback.
- Keep old Setup/staged application before normal owning builds replace their outputs.
- Actual Windows ARM64 x64-emulation acceptance is unavailable and must remain explicitly unverified.

## Review Focus

- Foreign filtering must follow the requested target, never build-host CPU or OS; verify unsupported targets retain all files.
- A broad regex must not affect a nested dependency or another package; use exact normalized root-relative paths.
- New upstream files/version changes must not be silently considered safe; verify retained inventory/source bytes and pin the reviewed package version.
- ASAR unpacking, worker metadata, PDB and toolchain hashes must remain unchanged.
- Baseline dependency changes and slimming changes must be separately measured; no old success evidence applies to the new lock baseline.

### Task 1: Preserve and restore the dependency baseline

**Files:** temporary ledger/snapshots under `tmp/becoder-slimming-20261019/`; existing two JSON node_modules are managed only by their owning npm commands.

- [x] Preserve current Setup, staged application, source status, JSON manifests/locks and old dependency trees with hashes; reject unexpected links.
- [x] Run `npm --prefix extensions/json-language-features ci --no-audit --no-fund` and the corresponding server command, independently, with 180-second limits. Manifests/locks must remain byte-identical.
- [x] Check all lock-listed installed production versions/paths, run JSON owning typechecks and rebuild JSON with its existing esbuild entry point.
- [x] Run the isolated packaged-Electron LSP observe/deny probe against the newly built server; do not launch the workbench.
- [x] Record restored JSON bundle hashes separately from slimming gains.

### Task 2: Exact-path filtering and artifact verification

**Files:** create `build/lib/sevenZip.ts`, `build/lib/test/sevenZip.test.ts`; modify `build/gulpfile.vscode.ts` and `build/azure-pipelines/win32/verify-becoder-package.ps1`.

**Interfaces:** `isSevenZipPlatformFile(relativePath: string, platform: string, arch: string): boolean`; `verifySevenZipPackage(asarPath: string, sourcePackageRoot: string): void`.

- [x] Write RED tests for dropping the ten literal foreign paths only on win32-x64; preserve the five reviewed entries, unknown paths, non-targets, Windows separators, nested packages and other packages.
- [x] Write real ASAR-fixture tests for foreign-file rejection, missing/changed retained file, unpacked target rejection and correct retained inventory.
- [x] Implement the smallest filter and verifier. Verifier checks reviewed 7zip-bin version 5.2.0, exactly five retained packed files, byte equality with source and AMD64 PE target.
- [x] Wire the filter before ASAR generation; invoke the verifier in the existing direct Windows package verifier, checking the Node exit code.
- [x] Observe GREEN for focused tests, then full build tests/typecheck/lint and parser checks.

### Task 3: Review, build and compare

- [x] Perform a primary read-only review and a fresh independent review of this task's changes, without treating existing dirty work as newly introduced.
- [x] Run `npm run typecheck-client` (120s), `npm run compile-oi-extensions` (120s), and `npm run gulp vscode-win32-x64-min` (300s).
- [x] Run direct package verification with `-IncludeCompiler $true`.
- [x] Compare old/final inventories, classifying only JSON baseline bundle updates separately; assert the ten foreign paths removed and all other ASAR payloads, unpacked files, PDB/toolchains/resources preserved.
- [x] Run final-artifact LSP and ASAR 7zip round trips using actual Electron, with private cwd/TEMP/TMP and no GUI.

### Task 4: Setup and handoff

- [x] Build `vscode-win32-x64-becoder-setup` (900s) and directly verify Setup (1200s) using isolated verifier-owned roots; preserve real desktop and uninstall registration through the existing verifier.
- [x] For exact attribution, compile a measurement-only control Setup in tmp from a copied final payload with only its ASAR restored to the old one, using the same helper, script and compression. It is not delivered; this separates the JSON baseline correction from the ten-file reduction.
- [x] Record new Setup bytes, SHA-256 and sidecar, separate baseline drift from the actual slimming model, and deliver for manual GUI acceptance.
- [x] Stop without commit/push or deleting preserved evidence.

## Execution and validation ledger

Use `tmp/becoder-slimming-20261019/progress.md` and `checks.jsonl`. Before each check, confirm executable/config/input existence; record command, timeout, exit/failure class and rerun requirements. No formal failure may be silently replaced with a different command or stale evidence.

The current non-main `codex/BeCoder_Next` checkout is reused because this continues the same dirty installation/package work and needs its validated inputs. No new worktree/setup/install of the root project is performed. Project-owner authorization and repository workflow take precedence over generic skill commit/cleanup/checkpoint steps.


## Delivery outcome — 2026-10-19

- Production Setup: 187602797 bytes / 178.911969 MiB; SHA256 `4ABDB6021241A744E79605C02080B275D5ECA885D83E694AB85553BC1E1523B0`.
- Prior Setup:191415857 bytes; reduction3813060 bytes /3.636417MiB /1.992029%.
- Matched unfiltered control:191416610 bytes; controlled reduction3813813 bytes /3.637136MiB. Same final tree except ASAR, same helper hash and compression. Control is not delivered.
- Focused11/11, build252/252, build/client typechecks, OI compilation, ESLint, parser and package verifier passed. Final ASAR 7zip and JSON LSP probes passed. Independent review found no blockers.
- Final staged build158423ms, production Setup retry419550ms, direct Setup verification546930ms, all exit0. First Setup attempt externally interrupted with no exit record; partial artifact/log retained, not delivered. Initial control excluded from attribution because helper changed during retry; fixed control passed411175ms.
- All2399 retained ASAR leaf contents/metadata and unrelated files preserved; only ten approved ASAR entries removed. Two JSON bundles independently rebuilt from existing locks; Runner helper differs only in PE timestamp/checksum.
- GUI and Windows ARM64 x64-emulation acceptance not performed. No commit/push. Preserved evidence retained.
