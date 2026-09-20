# CPH implementation validation

## Original entry-point alignment: 2026-09-20

Scope: restore the owner-approved original CPH behavior for JSON testcase import,
`Ctrl+Alt+B` run, `Ctrl+Alt+D` judge focus, local problems created from an existing
C/C++ file, and linked online problem titles. Submission commands, buttons and
shortcuts remain absent. Local-problem creation owns only its `.cph` metadata and
does not modify the existing source. No staged application build, package verifier,
GUI, Setup or Git operation belongs to this validation.

Frozen final commands (repository root, 120 seconds each, stop on first failure):

1. `npm --prefix extensions/becoder.cph run vscode:prepublish`
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
3. `node --test extensions/becoder.cph/out-test/test/*.test.js`

Two earlier test runs stopped correctly: the first exposed local metadata passing
through the web-only URL decoder; the second showed an unwanted
`customCheckerPath: undefined` property after reload. The source was corrected so
local metadata requires `local: true` and `url === srcPath`, browser imports retain
their HTTP(S) validation, and absent checker paths remain absent.

Final results: prepublish exit 0 (4.0s); test typecheck exit 0 (1.3s); complete
suite exit 0, 52/52 passed (18.2s), no skips. Primary read-only review checked
command/keybinding registration, absence of submission entries, local source
ownership, local-versus-web URL validation, JSON import limits, linked titles and
single-case running state. No application build or project-owner GUI acceptance
was performed; the existing staged package is not evidence for these changes.

## Settings and checker port: current validation plan

Owner permits external Python exclusively for custom checkers. No staged build,
GUI, Setup or Git operations in this validation sequence. Existing package GCC
and input helper are test fixtures only, not evidence for a new acceptance package.
Preflight confirmed TypeScript, esbuild, React, jsdom, VSCE, test configurations,
bundled GCC/helper files and external Python 3.13.1. All new inputs are ordinary
source files in the CPH extension. Source flags and Runner are unchanged.

Frozen root-cwd commands (120 seconds each; stop at first failure):

1. `npm --prefix extensions/becoder.cph run vscode:prepublish`
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
3. `node --test extensions/becoder.cph/out-test/test/*.test.js`

These emit only extension build outputs and request-owned test fixtures. Tests
cover upstream filename/template rules, source preservation, checker persistence,
output differences, checker UI messages/logs, real Python pass/fail/timeout/cancel/
missing interpreter, plus the existing complete extension regression suite.

Initial results: prepublish exit 0; test typecheck exit 0; complete suite 50/50,
exit 0 (16.9 seconds). Final review restored the exact upstream checker help
section and its link/book glyphs, and added the upstream extension-list PNG icon.
These changes invalidate the UI bundle/package inventory; repeat all three
commands against the final source before reporting completion.

Final results: prepublish exit 0 (3.6s), test typecheck exit 0 (1.1s), complete
suite exit 0, 50/50 passed (15.9s), no skips. Primary read-only review checked
settings consumers, original icon/help/log/diff resources, source preservation,
checker protocol and process retirement. No staged application build or GUI
acceptance was performed; the previous VSCode-win32-x64 is unchanged.

## Checkpoint 1: import contract and answer comparison

Working directory: repository root. Command entry point verified from installed
TypeScript package (`@typescript/typescript6` 6.0.2, `bin/tsc6`) and the existing
GCC diagnostics extension scripts. Configuration and source inputs exist.

Frozen sequence:

1. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
   (120 seconds). Emits only extension `out-test`; checks `problem.ts`, `judge.ts`
   and focused tests. Any failure stops later validation.
2. `node --test extensions/becoder.cph/out-test/test/problem.test.js`
   (120 seconds). Input must exist after step 1. No user project modifications.

Results (2026-09-19):

- Step 1: exit 0, no diagnostics, completed within one second.
- Step 2: exit 0, 9/9 tests passed, completed within one second.
- Source failure: none. Required reruns: both checks when these modules change.
- Primary-agent read-only review: imports discard untrusted extra properties;
  empty stdin remains empty (EOF); no sample is manufactured for an empty list;
  stderr content cannot mask process failure; stdout ANSI is not stripped for
  answer comparison. Aggregate zero-sample UI handling still needs implementation.

No package, browser, compiler execution or owner acceptance is implied by these
checks. The extension is not yet registered or included in the application build.

## Checkpoint 2: workspace import and persistence

Preflight: read the filesystem safety review and validation protocol. Commands
reuse checkpoint 1's verified TypeScript entry point and Node test runner.
`problemStore.ts` and `importController.ts` are reached by test imports. No build
or GUI commands belong to this checkpoint. Test temporary directories are created
with `mkdtempSync` and removed by their owning test only.

Frozen commands (repository root, 120 seconds each, stop on first failure):

1. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
2. `node --test extensions/becoder.cph/out-test/test/problem.test.js extensions/becoder.cph/out-test/test/problemStore.test.js extensions/becoder.cph/out-test/test/importController.test.js`

Results (2026-09-19):

- Step 1: exit 0, no diagnostics, completed within one second.
- Step 2: exit 0, 22/22 tests passed, completed within one second.
- Source failure: none. The tests cover workspace selection, no-workspace
  behavior, URL identity, repeat-import protection, concurrent import locking,
  confirmation races, cancellation, legacy metadata, filename collisions, and
  redirected `.cph` directories.
- Primary-agent read-only review: the source file is never replaced during an
  existing-URL import; metadata uses a temporary complete JSON publication;
  page paths and compiler values are ignored; no external Companion receiver is
  created. A failed metadata write intentionally leaves a newly created empty
  source rather than deleting user-owned workspace content.

The browser parser, extension registration, CPH UI, and real GCC process remain
outside this checkpoint.

## Checkpoint 3: pipe execution prototype

Preflight inputs: existing packaged `data/toolchains/ucrt64/bin/g++.exe` and
`resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe`
under `../VSCode-win32-x64`; these are read-only inputs, not modified packages.
The C++ fixture uses cpp-style. Tests create request-private temporary directories.

Frozen commands, repository root, stop on failure:

1. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json` (120 seconds)
2. `node --test extensions/becoder.cph/out-test/test/problem.test.js extensions/becoder.cph/out-test/test/problemStore.test.js extensions/becoder.cph/out-test/test/importController.test.js extensions/becoder.cph/out-test/test/execution.test.js` (120 seconds; real execution test has a 110-second deadline)

Results (2026-09-19):

- Step 1: exit 0, no diagnostics.
- Step 2: exit 1, 23 passed / 1 failed, approximately 8 seconds.
- Failure class: source (test assertion), not orchestration. The real test reached
  `assert.deepStrictEqual(process.env, originalEnvironment)`, which compares
  Node's special process.env object with an ordinary object snapshot.
- Original error: `AssertionError [ERR_ASSERTION]: Values have same structure but
  are not reference-equal`, operator `deepStrictEqual`, generated execution test
  line 85. Environment dump intentionally not repeated here.
- Earlier assertions in that real test passed: bundled GCC compile, separate
  stderr, correct answer, empty stdin EOF, exit 125, timeout, cleanup after normal
  and timeout runs, and no tests executed after compilation failure. These are
  partial observations, not an overall passing real-execution test.
- Required correction: compare plain snapshots or explicit environment key/value
  entries without dumping environment values on failure. Rerun owning typecheck
  and the full checkpoint-3 test command after authorization.
- Stop rule applied: no retry, application build, package check or GUI acceptance.

Prototype is not wired to the application; native helper reuse must still be
covered by fresh packaging and descendant/cancellation stress tests. Pending
review items include stale import-lock recovery and metadata temporary-file cleanup
on publication failure. No production readiness is claimed.

Authorized continuation: corrected the assertion to compare only changed key
names, never values. Owning typecheck exited 0; checkpoint-3 full test command
exited 0, 24/24 passed, approximately 8 seconds. The earlier failed run remains
recorded above.

Next rerun uses the same frozen commands and inputs after separating the 15-second
helper startup bound from the sample deadline, waiting for the control channel
to drain, and adding deterministic cancellation at the helper-start barrier.

Rerun: typecheck exit 0; full checkpoint-3 test command exit 0, 24/24 passed,
approximately 13 seconds. Cancellation at the started handshake is now covered.

## Checkpoint 4: extension-host import adapter

Preflight: owning `package.json` now declares `compile` using the same verified
TypeScript entry point. `tsconfig.json`, local VS Code API declarations and
English/Chinese localization files exist. The host test injects a VS Code API
stub into the compiled extension entry point; it is not Electron GUI acceptance.

Frozen commands, repository root, 120 seconds each, stop on failure:

1. `npm --prefix extensions/becoder.cph run compile`
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
3. `node --test extensions/becoder.cph/out-test/test/problem.test.js extensions/becoder.cph/out-test/test/problemStore.test.js extensions/becoder.cph/out-test/test/importController.test.js extensions/becoder.cph/out-test/test/execution.test.js extensions/becoder.cph/out-test/test/extension.test.js`

Results: all three commands exit 0; 25/25 tests pass, approximately 10 seconds.
No application build is part of this checkpoint.

## Checkpoint 5: browser parser bridge

Preflight: esbuild 0.28.2 and jsdom 26.1.0 installed in this extension only;
package-lock records exact transitive versions. Existing root validation wrapper
`extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs`
executes the repository's `npm run typecheck-client` with an external 120-second
deadline. Core bridge adds only a fixed bundled-parser operation, not arbitrary
script execution. DOM fixtures test parser behavior, not current live OJ support.

Frozen sequence from repository root (stop on failure):

1. `npm --prefix extensions/becoder.cph run compile-parsers`
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
3. `node --test extensions/becoder.cph/out-test/test/parser.test.js`
4. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs typecheck`

All deadlines 120 seconds. No application build or GUI claim.

Results:

- Parser bundle: exit 0, 23.8 KB browser IIFE.
- Extension test typecheck: exit 0.
- Parser tests: exit 1, 0/4 passed. Original error:
  `TypeError: Cannot read properties of undefined (reading 'parseCurrentProblem')`
  at compiled `parser.test.js:56:56`.
- Failure class: source (test harness). Each test evaluates the bundle, then
  accesses `dom.window.BeCoderCompanion`; this binding is not available there.
  Production evaluates the bundle and `BeCoderCompanion.parseCurrentProblem()`
  in one script. The test must model that same evaluation before assessing
  parser behavior. No parser correctness or live-site support is claimed.
- Stop rule applied. Core `typecheck-client` was NOT executed. No retry, package
  build, or GUI checks. After authorization, correct the harness and rerun the
  checkpoint, then run the unexecuted core check.

Authorized continuation: test now evaluates the bundle and parser call together,
matching production. Bundle and extension typecheck exit 0; parser tests 4/4
passed; core typecheck exit 0 (11.2 seconds, external 120-second limit).

Expanded parser fixtures cover AtCoder, Lanqiao, NowCoder and SPOJ as well.
Next frozen sequence: owning `npm --prefix extensions/becoder.cph run vscode:prepublish`,
the same extension test typecheck, then the checkpoint-4 complete test list plus
`extensions/becoder.cph/out-test/test/parser.test.js`. Stop on failure. This checks
the parser's new inclusion in the extension prepublish task, not the full app.

Results: extension prepublish exit 0 (TypeScript + 23.8 KB parser bundle);
test typecheck exit 0; combined six-file test command exit 0, 33/33 passed,
approximately 11.3 seconds. All six HTML parser fixtures pass. These synthetic
DOM fixtures are not evidence of current live-site compatibility. UVa/PDF, CPH
judge UI, complete application packaging, process-descendant stress, and owner
acceptance remain outstanding. No Git commit or application build performed.

## Checkpoint 6: CPH judge view and execution wiring

Preflight: React 18.3.1, React DOM 18.3.1, react-textarea-autosize 8.5.9 and
their pinned type packages installed only under this extension, locked in its
package-lock. TypeScript, esbuild shims, configs and existing GCC/helper paths
confirmed. Read filesystem-safety-review and validation-protocol. The view uses
the selected host-owned source; edit messages carry samples/revision, not paths.

Frozen sequence, repository root, 120 seconds per command, stop on first failure:

1. `npm --prefix extensions/becoder.cph run vscode:prepublish`
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
3. `node --test extensions/becoder.cph/out-test/test/problem.test.js extensions/becoder.cph/out-test/test/problemStore.test.js extensions/becoder.cph/out-test/test/importController.test.js extensions/becoder.cph/out-test/test/execution.test.js extensions/becoder.cph/out-test/test/extension.test.js extensions/becoder.cph/out-test/test/parser.test.js extensions/becoder.cph/out-test/test/judgeSession.test.js extensions/becoder.cph/out-test/test/webview.test.js`

Only extension out/dist outputs and owned test temporary directories are written.
No full app build, package or GUI acceptance in this checkpoint.

Results: step 1 exited 1. Host TypeScript completed; frontend TypeScript reported
`webview/App.tsx(6,8): error TS2882: Cannot find module or type declarations for side-effect import of './app.css'.`
Failure class: source, missing frontend CSS module declaration. Parser/webview
bundles and steps 2/3 did not execute. Required correction: declare the CSS import
in the webview TypeScript ownership area, then rerun this frozen sequence after
authorization. The new judge view/session tests are not claimed as passing.

Authorized continuation: added `webview/assets.d.ts` CSS module declaration.
All three checkpoint-6 commands exited 0, with 38/38 tests passed (7.2 seconds).
Primary-agent review found silent presentation truncation; added an explicit
localized truncation marker and regression test. Rerun the same frozen sequence
for this correction. No GUI or staged application verification is implied.

Final checkpoint-6 rerun: extension prepublish exit 0, test typecheck exit 0,
all 39 tests passed (6.3 seconds). Covers explicit output truncation as well as
the prior judge-session and DOM UI cases. Core bridge is unchanged since its
last passing typecheck. Full application packaging, real webview GUI acceptance,
UVa/PDF and previously listed lifecycle hardening remain outstanding.

## Checkpoint 7: distribution entries and package inventory

Preflight: VSCE is installed under build/node_modules (as used by build/lib/extensions.ts),
not the repository root. An initial read-only module-location probe had a syntax
typo and then checked the wrong root; neither invoked a validator. Correct module
location and package metadata verified. TypeScript, npm scripts and existing
120-second Runner validation wrapper confirmed. No user environment changed.

Frozen commands, root cwd, stop on failure:

1. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
2. `node --test extensions/becoder.cph/out-test/test/package.test.js`
3. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs typecheck`
4. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs extensions`

120-second limits. VSCE listFiles checks the actual extension packaging filter;
it does not create a VSIX or staged application. Original CPH restriction switch
and protected-extension policy remain pending full integration readiness.

Results: step 1 exit 0; package tests exit 0 (2/2 passed); core typecheck exit 0
(6.4 seconds); standard compile-oi-extensions exit 0 (16.4 seconds, including
the new CPH prepublish). No timeout. No staged application/Setup build, owner
GUI acceptance, Git commit or push. License texts are included alongside source
provenance; the package verifier now requires the CPH runtime and license files.

## Checkpoint 8: kernel-owned workspace lease

Preflight: same TypeScript/esbuild and real GCC inputs as previous checkpoints.
New lease test uses Node child_process and waits for an IPC-ready barrier before
terminating its own child. No user process is stopped. Publication-failure test
mocks rename only in its isolated Node test process and restores it before retry.

Frozen sequence (root cwd, 120 seconds each, stop on failure):

1. `npm --prefix extensions/becoder.cph run vscode:prepublish`
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`
3. `node --test extensions/becoder.cph/out-test/test/*.test.js`

Node's test runner owns glob expansion; all emitted tests are in the extension's
ignored out-test directory. Results pending. No GUI/application build yet.

Results: extension prepublish exit 0; test typecheck exit 0; full extension suite
exit 0, 45/45 passed (6.4 seconds). Kernel occupancy release verified after killing
only the test's child at its IPC-ready barrier. Simulated publication failures
preserve original metadata, remove the request-owned temporary file, and release
the lease. Old prototype lock files are ignored and left untouched.

GUI preflight: launch skill's launcher requires macOS/Linux and cannot be used
directly on this Windows checkout. Existing staged app/helper are available but
the staged app does not contain the new browser bridge. A fresh application build
is required for genuine browser-to-CPH GUI acceptance; no old-package result is
claimed as proof of the new bridge. No GUI instance was started in this checkpoint.

## Checkpoint 9: bundled-extension policy

Protect becoder.cph, block the original third-party ID, and remove its report
exception alongside the new build registration. No user extension files or .cph
data are deleted. Exact component/protection lists are synchronized.

Preflight: build/package.json uses native Node TypeScript tests; both test files
and their source inputs exist. Frozen sequence, root cwd, 120 seconds each:

1. `node --test build/lib/test/extensionControlManifestPolicy.test.ts build/lib/test/oiExtensionBoundary.test.ts`
2. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs typecheck`
3. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs extensions`

Stop on first failure. Results pending; no package or GUI acceptance implied.

Results: policy/boundary tests exit 0, 30/30; core typecheck exit 0 (5.8 seconds);
standard extension compilation exit 0 (12.6 seconds).

## Checkpoint 10: first integrated development package

Read-only preflight: no BeCoder process running; existing package resolves exactly
to `C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64`, is not linked, and backup target
`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64-before-cph-integration-20260919`
does not exist. Preserve that entire directory (including data/coding) by moving
it before the normal staged build. No cleanup of old assets or user data.

Frozen validation after preservation:

1. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs windows`
   wraps `npm run gulp vscode-win32-x64-min` with the required external 300-second limit.
2. `./build/azure-pipelines/win32/verify-becoder-package.ps1 -PackagePath C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64 -IncludeCompiler $true`

Stop on failure. This is a development integration package, not complete-stage
owner acceptance. PDF/UVa and live-site verification remain outstanding.

Results: staged build exit 0, 115.3 seconds (Electron download recovered using
the build tool's own retries); direct package verifier exit 0 with compiler.
Old full package preserved at the declared backup path. Current standard package
has fresh installation data, not copied user data.

GUI preflight: use launch skill's CDP isolation/snapshot workflow with the existing
Windows runnerGuiLaunch.cjs (bash launcher is inapplicable). Commands: launch via
`node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerGuiLaunch.cjs`, then
attach the installed @playwright/cli under a unique session to its reported CDP
port. Only generated test workspace and this new application instance are in scope.
No old user profile is copied or modified. Runtime results pending.

Runtime evidence (2026-09-19): launched new package (PID 4572, CDP 38117), unique
Playwright session cph-integration-0919, generated workspace gui-project-2zPiQk.
Real https://www.luogu.com.cn/problem/P1001 loaded; Import Problem created
P1001 A+B Problem.cpp and .prob containing input `20 30\n`, expected `50\n`,
timeLimit 1000, memoryLimit 512. CPH card and source editor opened beside browser.
Screenshot: .build/runner-validation/cph-import.png.

Runtime failure: after entering a sum solution using BeCoder `debug(a,b)`, Run All
reported `error: 'debug' was not declared in this scope`. Screenshot:
.build/runner-validation/cph-run.png. Stop rule applied; no further judge/site
acceptance or fixes. Automation-owned window closed; no BeCoder process remained.

Read-only diagnosis: CPH currently passes -DDEBUG but no explicit language standard
or debugger include. Runner defaults to -std=c++20. Toolchain assembly builds its
single stdc++.h PCH with -std=c++20 and -include bits/debugger.h; the text stdc++.h
does not include debugger.h. Thus CPH relies on a PCH its flags may invalidate.
Need explicit debug-header inclusion independent of PCH validity, and a real
debug() fixture (previous executor test used only cerr). Exact compiler/PCH trace
and correction remain for the authorized continuation. Build/package verification
passed but runtime acceptance did not. Existing old package remains in backup.

Automation notes: refreshed stale UI refs after navigation; initial paste events
did not enter Monaco text, verified empty file and switched to actual keyboard
insertion. These were corrected orchestration issues, not successful product
results. Empty-source compilation was observed before the sum program test.

## Owner-requested visual correction

Owner explicitly freezes debug behavior as accepted; do not modify compiler,
debugger headers, macros or templates. Match supplied CPH VSIX styles; preserve
existing sample operations and only remove previously excluded product surfaces.
Atomic visual delivery: standard checks, one fresh Windows build, then stop.
No agent GUI, package verifier, Setup or Git operations after that build.

Preflight: installed TypeScript/esbuild/React inputs exist; codicon.ttf copied
as a binary asset from owner's VSIX, CSS mappings and font license preserved.
Existing DOM test selectors updated for labelled icon buttons. Frozen commands:

1. `npm --prefix extensions/becoder.cph run vscode:prepublish` (120s)
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json` (120s)
3. `node --test extensions/becoder.cph/out-test/test/webview.test.js` (120s)
4. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs typecheck` (120s)
5. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs extensions` (120s)
6. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs windows` (300s)

Stop on failure. Preserve old package by verified sibling move after owner closes
it; build standard directory from absent destination, retaining dependencies and
caches. Build wrapper records exact exit/time results automatically. User performs
visual acceptance after build. No claim of new debug validation.

Pre-build results: extension prepublish exit 0 (including actual 74.4 KB Codicon
font emission), test typecheck exit 0, existing UI regression 1/1 passed, core
typecheck exit 0 (7.2 seconds), OI extension compilation exit 0 (17.4 seconds).
Owner confirmed BeCoder closed. Exact standard package path and absent backup
`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64-before-cph-visual-20260919`
verified; no BeCoder processes present. Old directory will be preserved intact.
New build uses fresh destination and fresh data; no old test profile is copied.
Final build result is recorded automatically in .build/runner-validation/ledger.jsonl.
Stop immediately after successful build, as requested.

## Second owner visual correction

Reference: owner VSIX and agrawal-d/cph pinned source. Restore 500ms automatic
sample saving, compile-only split menu, delete-to-trash for the current .prob
(source is preserved), settings button and matching container/view titles.
Remove empty status spacing; cap textarea visible rows excluding one terminal
newline without changing stored bytes. Compiler/debug flags are unchanged.

Read validation/filesystem instructions; installed TypeScript, esbuild, React,
GCC/helper inputs confirmed. Existing tests updated for auto-save and configuration.
Frozen root-cwd sequence (stop on failure):

1. `npm --prefix extensions/becoder.cph run vscode:prepublish` (120s)
2. `node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json` (120s)
3. `node --test extensions/becoder.cph/out-test/test/*.test.js` (120s)
4. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs typecheck` (120s)
5. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs extensions` (120s)
6. `node extensions/danielpinto8zz6.c-cpp-compile-run/test/runnerValidation.cjs windows` (300s)

Owner confirmed app closed. Preserve previous package under a new verified sibling
backup, build fresh destination, then stop for owner acceptance. No GUI/Setup/Git.

Pre-build results: prepublish exit 0, test typecheck exit 0, complete suite
45/45 passed, core typecheck exit 0 (7.0s), OI compile exit 0 (16.9s). The
interrupted turn did not move or alter the existing package; read-only recheck
found no BeCoder process, target exists, backup absent. Continue with verified
move and the single authorized staged build.
