# Browser problem actions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the confirmed fixed Get Problem split button and two source-compatible CPH entry paths.

**Architecture:** Reuse native submenu split-button rendering. Generate URL patterns from the bundled Companion parser registry; keep OJ identity and filename decisions in its existing adapters. CPH owns source creation, templates and sample publication for direct imports; Get Problem retains the existing OJ source store and panel binding.

**Tech Stack:** TypeScript, native Action2/menus/context keys, existing esbuild and Node tests, Chromium/Electron fixture verification.

**Spec:** [Approved design](../specs/2026-11-17-browser-problem-actions-design.md).

## Global constraints

- Fixed primary Get Problem, OJ Connect icon, independently available dropdown; ordered Get Problem / Import to CPH.
- No extra production dependency, login/submission/record changes, speculative fallback, source overwrite or automatic online submission.
- Current feature checkout `OJ_connect` is used in place as in prior approved development. Do not create another checkout or reinstall dependencies. No product commit or push is included.
- User approved implementation and previously requested uninterrupted execution. Execute inline, inspect actual effects, fix findings and deliver stage; do not re-ask product scope already confirmed.

## Review focus

- A disabled primary must not disable the arrow or hide disabled menu entries.
- An unsupported OJ entry on a supported hostname must retain CPH fallback.
- Navigation while a parser, workspace picker or overwrite dialog is pending must not publish the old result.
- Get-first and CPH-first must address the exact same source without reinitializing it.
- CPH template path remains relative to the selected workspace root even when the source is in a site child.

### Task 1: Canonical direct CPH import destination

**Files:** OJ `src/importController.ts`, `src/extension.ts`, manifest activation; CPH `src/importController.ts`, `src/problemStore.ts`, `src/extension.ts` and their tests.

**Interfaces:** `_becoder.ojConnect.importTarget(url)` returns `{ directory: string; fileName: string } | undefined`, without IO or a workspace picker. CPH `ImportController.import(json, url, destination?, requestId?)` consumes this trusted descriptor, validates it, chooses the root once, creates an ordinary direct child and forces the adapter `.cpp` filename. OJ adapters remain the only naming authority. CPH ProblemStore accepts a precise new-or-existing source, retaining template initialization only for new files. Cancellation passes an opaque request ID through commands to the owning controller's AbortController; it also handles cancellation before extension activation finishes.

- [x] Add failing tests for the three sites, custom directories, non-supported entries, destination traversal, long filenames, workspace/template behavior, source reuse, replacement cancellation and abort during picker/confirmation.
- [x] Run owning compiled tests and record failures.
- [x] Implement destination selection, precise source publication and CPH template handling; preserve direct imports without a destination.
- [x] Rerun OJ and CPH owning suites; inspect file side effects.

### Task 2: URL capability and native split button

**Files:** CPH `companion/entry.ts`, `build-parsers.mts`, manifest script; browserView common service/commands, main parser-pattern reader, `browserProblemFeature.ts`, focused browser tests and styles only if the native item needs local sizing.

**Interfaces:** CPH build emits `dist/problem-parser-patterns.json` from `getMatchPatterns()`. Main service exposes read-only `getProblemParserPatterns()` and loads the fixed bundled pure `browserProblem.js` for OJ identities without extension activation or network requests. Browser contribution tracks scoped URL/loading/busy keys. Its submenu is always available, `isSplitButton: true`, first item Get Problem and second Import to CPH; no promoted last action. One scoped native action-view provider draws the existing SVG menu icons; no platform menu API changes.

- [x] Add failing parser capability tests and native menu tests for URL/loading/disabled-primary behavior.
- [x] Generate patterns during existing parser compilation; add bounded file loading and fixed read-only service method.
- [x] Replace the old mixed Import action with two explicit actions sharing one busy/cancellation owner, native submenu and existing SVG assets.
- [x] Observe navigation/model disposal and abort outstanding import via trusted internal cancellation commands; protect final filesystem publication checks, not just the parser response.
- [x] Run owning tests and render actual native split button states, menu and keyboard navigation.

### Task 3: Three-station CPH workflow regression and delivery

**Files:** OJ/CPH integration fixture tests or isolated test harness in ignored scratch; existing user README and architecture import sections; validation ledger in `.superpowers/sdd/2026-11-17-browser-problem-actions/`.

- [x] Exercise Get Problem → panel send to CPH with real import/storage and fixture panel interactions; verify exact samples, limits, source identity, unsaved draft protection and no template replay. Explicitly compile/run isolated A+B fixtures locally through the existing executor.
- [x] Exercise direct CPH → Get → panel CPH and Get → panel CPH → direct CPH; test replacement cancel/accept and mismatched active editor/browser page.
- [x] Review final diff for dead old import routes, scope, races, path safety, localization, build entries and provenance. Correct concrete findings and rerun affected checks.
- [x] Update current import documentation to match the two explicit browser actions.
- [x] Preflight and freeze owning scripts, hygiene/lint, `npm run typecheck-client` (120 s), `npm run compile-oi-extensions` (120 s), and `npm run gulp vscode-win32-x64-min` (300 s). Record exact results; no hook bypass, package verifier or Setup.
- [ ] Ensure stage target is not occupied; deliver staged application after successful build. User runtime acceptance remains separate.

## Validation preflight

Owning commands are sourced from current manifests: `npm --prefix extensions/becoder.oj-connect test`, CPH parser compilation, CPH `tsconfig.test.json` plus Node test runner, OJ typecheck and existing browser Electron runner. Use existing executables under node_modules; confirm paths before formal runs. Red tests are expected feature evidence; orchestration failures are recorded separately. Keep the standard final validation sequence blocked on failing required owning checks.
