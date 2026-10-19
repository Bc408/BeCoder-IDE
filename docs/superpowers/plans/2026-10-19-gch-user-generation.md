# User-Generated Universal Header Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the prebuilt GCC PCH and redundant diagnostics page, add a reliable user-triggered universal-header cache generator, and measure the reported Run-to-compile-banner latency. The owner explicitly waived reproducing the C delay as a delivery gate.

**Closeout status (2026-10-19):** Tasks 2–4 are implemented and source/package/runtime checks have passed. Task 1 instrumentation and measurements are complete; the reported C delay was not reproduced by the agent, so no speculative C performance fix was made. Task 5 runtime checks and final staged-package/Setup verification are complete. The owner subsequently confirmed the C delay no longer occurs, accepted the complete change, and authorized committing and pushing to the corresponding branch. The original step checkboxes below preserve execution-plan history rather than claiming every proposed test was executed verbatim. Detailed validation evidence and deviations remain in `.superpowers/sdd/2026-10-19-gch-user-generation/progress.md`. No Release publication is authorized.

**Architecture:** Keep `stdc++.h.gch` beside `bits/stdc++.h` and let Runner's shared compiler policy determine compatible arguments. The Setup extension owns generation, validation, and install health; Runner consumes GCC's adjacent cache naturally; the workbench only contributes the gear-menu command. Measure and fix the current Runner latency before attributing any part of it to PCH.

**Tech Stack:** TypeScript VS Code extensions, Node child processes and filesystem APIs, PowerShell toolchain assembly and package verifier, existing Code OSS `MenuId.GlobalActivity` contribution.

**Spec:** `docs/superpowers/specs/2026-10-19-gch-user-generation-design.md`

## Global Constraints

- Missing, invalid, or incompatible gch must never block normal C/C++ compilation.
- Generate only `bits/stdc++.h.gch`, using the current effective user C++ settings and compiler semantics.
- Cleanup is limited to gch caches owned by this BeCoder installation; never follow links or delete user project or foreign toolchain files.
- Keep Runner, CPH, Notebook, debugger.h, GCC diagnostics, clangd, cancellation, source snapshots, evidence, and output behavior intact.
- Concurrent generation is rejected immediately; no queue, retry, privilege escalation, or alternate cache location.
- Keep English and Simplified Chinese UI synchronized.
- Do not edit generated output, clean caches, commit, push, or claim GUI/runtime acceptance from source or package checks.

## Review Focus

- A C++ PCH built with incompatible macros, standard, or flags must not be reported as generated and usable; test actual GCC cache use and fallback behavior.
- Deletion of stale `.gch` directories and malformed files must stay inside the authenticated installation root; test reparse-point and replacement boundaries.
- A second generation request or another window must not enter a destructive cleanup while the first compiler process is alive; test ownership and retirement.
- Cancellation, extension shutdown, or compiler failure after cleanup must leave ordinary compilation available and no partial cache accepted.
- The reported latency spans Run request through a terminal banner, while current metrics split only part of that path; measure before choosing the fix and preserve C and C++ semantics.

---

### Task 1: Reproduce and localize Runner latency

**Files:**
- Modify: `extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerProcess.ts`
- Modify: `extensions/danielpinto8zz6.c-cpp-compile-run/src/compile-run-manager.ts`
- Test: `extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerProcess.test.ts`
- Test: `extensions/danielpinto8zz6.c-cpp-compile-run/test/compileRunManager.test.ts` (confirm exact existing test path before editing)

**Interfaces:**
- Reuse `compilerSpawnMs`, `compileMs`, `panelReadyMs`, `saveMs`, and `totalMs`; add `preCompileMs`, `runnerPreparationMs`, `publishMs`, and `bannerElapsedMs` so the exact Run-to-banner boundary and its compiler phases are visible in one trace record.
- Output-channel trace reports phase measurements and language without source contents or secrets.

- [x] **Step 1: Write the failing timing assertion** for the click-to-banner interval and phase fields.
- [x] **Step 2: Run `npm --prefix extensions/danielpinto8zz6-c-cpp-compile-run test` and confirm the expected TypeScript failure for missing timing fields.**
- [x] **Step 3: Add timing instrumentation** for precompile, Runner preparation, compiler duration, publication, and click-to-banner.
- [x] **Step 4: Run the Runner suite;** the live isolated UI trace remains to be collected after building the current app.
- [ ] **Step 5: Reproduce against the actual isolated BeCoder instance** using the user's simple `.c` and `.cpp` cases, absent gch, recording cold and repeat timings before making a performance change.
- [ ] **Step 6: Based on measured bottleneck, write a regression test, confirm it fails, implement one targeted fix, and repeat until both paths improve without dropping lifecycle or safety behavior.** If evidence points outside the authorized execution path or requires a material architecture change, stop and report.

### Task 2: Make PCH a runtime-generated optional cache

**Files:**
- Modify: `build/win32/assemble-becoder-ucrt64.ps1`
- Modify: `build/lib/becoderToolchain.ts`
- Modify: `extensions/becoder.setup/src/toolchain.ts`
- Modify: `build/azure-pipelines/win32/verify-becoder-package.ps1`
- Modify: associated toolchain manifest/package tests discovered by references before editing.

**Interfaces:**
- Toolchain health validation excludes the optional generated `bits/stdc++.h.gch` while retaining integrity checks for compiler, runtime, and original headers.
- Build output contains no `.gch` and no build step generates one.

- [ ] **Step 1: Add failing tests/verifier assertions** for missing gch being healthy, packaged gch being forbidden, and original required compiler/header files remaining required.
- [ ] **Step 2: Run the owning focused checks** and confirm they fail on existing required-gch behavior.
- [ ] **Step 3: Remove build-time PCH generation and remove gch from declared required payloads.** Preserve probe coverage for the ordinary non-PCH C++ toolchain.
- [ ] **Step 4: Update package verification** to reject release gch and require original header plus compiler essentials.
- [ ] **Step 5: Run focused manifest, assembly-script, and package-policy tests.**

### Task 3: Implement safe explicit cache regeneration

**Files:**
- Create: `extensions/becoder.setup/src/pchCache.ts`
- Modify: `extensions/becoder.setup/src/extension.ts`
- Modify: `extensions/danielpinto8zz6.c-cpp-compile-run/src/compiler.ts`
- Modify: `extensions/danielpinto8zz6.c-cpp-compile-run/src/compilation.ts`
- Create or modify: adjacent `extensions/becoder.setup/test/*.test.ts` after inspecting two local test files.
- Modify: extension localization files.

**Interfaces:**
- Setup registers `becoder.generateGchCache`; runner exposes a shared helper that derives only valid precompiled-header arguments from `RunnerSettings` and standard Runner flags.
- Cache generator owns one cross-window task/lock for the authenticated current toolchain; repeated invocation returns an immediate busy result.

- [ ] **Step 1: Inspect two neighboring Setup tests and define the generator's injectable filesystem/process boundary.**
- [ ] **Step 2: Write failing tests** for full scoped stale-cache cleanup, parameter snapshot, PCH argument parity, actual hit probe, busy rejection, failure, cancellation, and lock retirement.
- [ ] **Step 3: Run the Setup extension test command and confirm expected failures.**
- [ ] **Step 4: Implement PCH argument derivation from the existing Runner settings/validation.** Exclude ordinary source/output arguments; preserve relevant standard, macros, charset, and debugger.h semantics.
- [ ] **Step 5: Implement root-bound cache enumeration/deletion** covering old toolchain locations and `.gch` files/directories without traversing reparse points; reject ambiguous ownership and deletion failure.
- [x] **Step 6: Implement exclusive process ownership, child cancellation on command/extension shutdown, temporary output publication, and full installation-scoped failure cleanup.** The owner's later decision removes per-file identity checks and replacement preservation. No live-owner timeout takeover.
- [ ] **Step 7: Generate the adjacent cache, verify GCC actually loads it with a controlled probe, then show success.** Keep verification-only diagnostic flags out of normal builds.
- [ ] **Step 8: Run tests for generation failures, cancellation and immediate retry, cross-window busy behavior, and ordinary no-cache compilation.**

### Task 4: Remove obsolete diagnostics UI and add gear command

**Files:**
- Delete: `extensions/becoder.setup/src/toolchainDiagnostics.ts`
- Modify: `extensions/becoder.setup/src/toolchain.ts`
- Modify: `extensions/becoder.setup/src/extension.ts`
- Modify: `extensions/becoder.setup/package.json` and `package.nls*.json`
- Modify: `src/vs/workbench/contrib/preferences/browser/preferences.contribution.ts` or the owning BeCoder global activity contribution identified during source tracing.
- Modify: package verifier command/resource expectations.

**Interfaces:**
- Damaged-toolchain notification offers only Get BeCoder Setup.
- Gear menu invokes `becoder.generateGchCache`; Setup owns generation and localized progress/completion/failure messages.

- [ ] **Step 1: Add failing manifest/command tests** for no diagnostics command/page and the new gear action being present and correctly ordered.
- [ ] **Step 2: Confirm failures using extension/workbench focused checks.**
- [ ] **Step 3: Remove diagnostics registration, command, page, translations, and package requirements while retaining health-check notification.**
- [ ] **Step 4: Add localized cache-generation command and global-activity menu item.**
- [ ] **Step 5: Run workbench menu tests, extension tests, and both-language package verifier checks.**

### Task 5: Integrated latency, cache, and visual acceptance

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-gch-user-generation-design.md` to record final implementation facts/evidence, preserving the decision history.
- Modify: relevant current implementation README(s) only where their claims become stale.

- [ ] **Step 1: Run extension-focused tests and owning watch/type checks** for all changed modules.
- [ ] **Step 2: Complete read-only validation-command preflight** and freeze the ledger for `npm run typecheck-client`, `npm run compile-oi-extensions`, targeted extension/workbench tests, `npm run gulp vscode-win32-x64-min`, and direct package verification. Use the AGENTS.md timeouts and stop at any failed gate.
- [ ] **Step 3: Build the staged app and directly verify the package** contains no gch or diagnostics page and includes the new command.
- [ ] **Step 4: Launch isolated instance and visually iterate** the gear menu, progress notification, success/failure notices, and damaged-toolchain prompt; capture desktop screenshots.
- [ ] **Step 5: Exercise no-gch C and C++ compile/run, generated-cache hit in Runner/CPH/Notebook, cancellation, and cross-window busy behavior.** Report timing medians and actual PCH-hit evidence separately.
- [ ] **Step 6: Perform primary read-only final review**, rerun invalidated checks, and hand back artifacts and runtime evidence. Do not commit, push, publish Setup, or claim project-owner acceptance.
