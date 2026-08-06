# BeCoder Project Handoff

This is the authoritative development handoff for BeCoder. Starting on 2026-08-07, all unfinished and newly approved work belongs to **Stage 4**. Earlier stage numbers are historical labels only and must not be used to split, prioritize, or infer current requirements.

The active requirements in this document override older implementation directions when they conflict. In particular, Stage 4 replaces the previous clangd-diagnostics, managed `.clangd`, and semantic-token-highlighting design.

## 1. Current Baseline

- Repository root: `C:\Users\Bc\Desktop\BeCoder\BeCoder_new`
- GitHub repository: `https://github.com/Bc408/BeCoder.git`
- Release branch: `main`
- Active development branch: `codex/stage4`
- Active baseline commit: `a8ac68f` (`feat(stage10): optimize highlighting and isolate toolchains`)
- Latest remote checkpoint with the same commit: `origin/codex/stage_next`
- Current `main` commit: `c028603`
- Stable runtime reference: `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`
- The stable reference package is outside the repository and must not be modified.
- The untracked `build/npm/stubs/cpu-features/` directory predates this handoff rewrite and must not be staged, modified, or removed without separate authorization.

The bundled toolchain archives are intentional Git LFS assets:

- `resources/oi-defaults/toolchains/becoder-ucrt64.zip`
- `resources/oi-defaults/toolchains/clangd-windows-22.1.6.zip`

Do not replace these archives with extracted directories. Preserve `.gitattributes`, LFS pointers, `LICENSE`, `ThirdPartyNotices.txt`, and all third-party license files.

## 2. Product Definition and Philosophy

BeCoder is a lightweight portable Code - OSS fork for C and C++ competitive programming, focused on OI and ICPC workflows.

The project owner's product principle is:

> 在 BeCoder 中，只有原生终端主动接纳用户电脑的运行环境。其余核心功能都应尽可能隔离系统配置，只使用 BeCoder 自己准备的路径、配置和资源。BeCoder 应当开箱即用，首次打开就是项目准备好的最佳默认状态；用户可以自行配置，但产品不主动要求用户先完成配置。

The resulting ownership boundary is strict:

| Area | Authority and environment |
| --- | --- |
| Native PowerShell | User system environment and arbitrary user commands |
| BeCoder Runner and BC panel | BeCoder-owned compile/run workflow only |
| C/C++ visual highlighting | One built-in TextMate grammar and BeCoder One Monokai |
| C/C++ code intelligence | Private bundled clangd with a closed feature set |
| C/C++ diagnostics | Private bundled GCC only |
| C/C++ formatting | clangd's embedded ClangFormat engine with Google fallback style |
| Toolchain setup | BeCoder-owned archives, paths, configuration, and storage |

Core product requirements:

- Preserve the normal Code - OSS editor and a familiar VS Code-like workbench.
- Bundle UCRT64 GCC 14.1.0, clangd 22.1.6, `stdc++.h.gch`, and `debugger.h` for offline use.
- Default to C17 for C and C++20 for C++.
- Automatically save the focused C/C++ file before Run actions.
- Keep native PowerShell fully separate from Runner, clangd, and the diagnostic worker.
- Do not bundle CPH, cpptools, GDB, external OJ services, account login, online submission, or ShortestPath network services.
- Allow users to install optional extensions later through the marketplace or local `.vsix` flow.
- Remove the first-open custom configuration page and open directly with BeCoder defaults.
- Keep the fork close to upstream Code - OSS and implement BeCoder-specific behavior in focused built-in extensions or narrow integration points.

## 3. Stage 4 Management Rules

Stage 4 is one continuous product stage. Work is tracked by named feature areas, not by new numbered substages.

Feature statuses are:

- **Planned**: requirement accepted, implementation not started.
- **In progress**: source work has started but the feature is not complete.
- **Source validated**: implementation and relevant source tests pass.
- **Built**: the Windows portable package and direct package verification pass.
- **User accepted**: the project owner completed the required GUI/runtime acceptance.
- **Archived**: the completed feature has a permanent record in this document.

A feature must not be archived merely because code was written. Its archive entry must record:

- requirement and user-visible behavior;
- owning source locations;
- commit or pull request;
- tests and build results actually completed;
- user acceptance status;
- retained risks or follow-up work.

After every feature is completed, update the Stage 4 work register and append a feature archive entry before starting unrelated implementation.

## 4. Stage 4 Requirements

### C/C++ Visual System

The accepted visual architecture is **Better C++ Syntax grammar content plus BeCoder One Monokai, with TextMate as the final and only coloring authority**.

Grammar requirements:

- Vendor the selected Better C++ Syntax grammar snapshot into the built-in `extensions/cpp` language extension.
- Keep exactly one `source.cpp` grammar owner.
- Do not restore the separately bundled `jeff-hykin.better-cpp-syntax` extension.
- Preserve and extend the existing regression test that rejects duplicate `source.cpp` owners.
- Record the selected upstream commit, MIT license, and third-party notice.
- Before replacing the current snapshot, compare the current grammar with the effective ShortestPath Better C++ Syntax grammar using representative OI code and token scopes.

Theme requirements:

- Add One Monokai as a BeCoder-owned built-in system extension, not a marketplace-managed dependency.
- Use a distinct built-in identity such as `becoder.one-monokai` and a visible label such as `BeCoder One Monokai`.
- Make it the first-launch default without forcing it again after a user selects another theme.
- Protect the built-in identity from replacement by a user or workspace extension while preserving extension-development overrides.
- Preserve the upstream MIT license and Joshua Azemoh copyright notice.
- Keep theme implementation in a built-in extension instead of hard-coding colors in workbench source.

Semantic-coloring boundary:

- Set `semanticHighlighting` to `false` in the BeCoder One Monokai theme.
- Default `editor.semanticHighlighting.enabled` to `false` for `c`, `cpp`, and `cuda-cpp`.
- Do not register or request clangd semantic tokens.
- Remove the existing semantic-token persistence, fingerprint, invalidation, delta reconstruction, and background refresh paths.
- Opening a file must reach its final visual coloring through TextMate without a later clangd recolor.
- A file containing `#include <bits/stdc++.h>` must not have a visible wait for a second "complete" highlighting state.

Visual acceptance must include templates, macros, lambdas, structured bindings, concepts, STL types, `bits/stdc++.h`, `debugger.h`, C17 code, and large source files. Compare token scopes and screenshots against `C:\Users\Bc\Desktop\BeCoder\shortestpath-ide-Release-v0.2.8` and the approved reference image.

### clangd Code Intelligence and Google Formatting

clangd remains bundled, but it is no longer a diagnostic or visual-highlighting authority.

The only clangd capabilities BeCoder exposes are:

- completion;
- signature help;
- hover;
- definition;
- references;
- prepare rename and rename;
- document formatting and range formatting.

clangd must still preprocess includes and build an AST/Sema representation internally because the retained intelligence features require it. Existing optimizations that reduce startup, toolchain discovery, and header-analysis cost remain useful. This internal work must not trigger a second visual-highlighting phase.

Disable or remove the client paths for:

- diagnostics display and diagnostic false-positive filters;
- semantic tokens and semantic-token caches;
- inlay hints;
- inactive-region decorations;
- code actions and clang-tidy integration;
- workspace symbols and persistent background indexing;
- type hierarchy;
- AST and memory-usage views;
- source/header switching;
- configuration-file UI and watchers;
- clangd formatting-on-type integration.

Configuration and isolation requirements:

- Start only the fixed clangd executable under BeCoder's extracted private toolchain.
- Use `--enable-config=false` so clangd does not read project or user `.clangd` files.
- Stop generating, reading, migrating, hiding, or rewriting `.clangd` files.
- Never delete a workspace `.clangd`; it may belong to VS Code or another tool.
- Ignore `compile_commands.json` and continue supplying BeCoder-owned language-specific compiler arguments through the LSP boundary.
- Use bundled GCC-compatible target and include paths without compiler discovery through system `PATH`.
- Keep the clangd child environment private: BeCoder-owned `PATH`, temp, profile, app-data, `HOME`, and XDG configuration roots.
- Do not permit settings such as `clangd.path`, external fallback flags, scripts, downloads, or update checks to replace the managed process.
- Disable persistent background workspace indexing. Definition, references, and rename are guaranteed for the current translation unit; complete large-project cross-file indexing is outside BeCoder's OI scope.
- Do not let completion auto-insert include directives unless the project owner approves that behavior separately.

Formatting requirements:

- Use clangd's embedded ClangFormat engine; do not add `clang-format.exe`.
- Set clangd's fallback style to Google.
- Support explicit Format Document and Format Selection commands.
- Keep format-on-type and format-on-save disabled by default.
- Do not generate a `.clang-format` file.
- If the opened workspace explicitly contains `.clang-format`, treat it as a user project asset and allow it to override the Google fallback.
- Do not let a `.clang-format` outside the opened workspace, a user profile, or another system location affect BeCoder formatting. The workspace-contained `.clang-format` is the only approved project-level formatting override and is not an exception to the `.clangd` ban.
- Formatting must not enable clangd diagnostics, semantic tokens, or general code actions.

### Bundled GCC Diagnostics

Bundled GCC is the sole authority for visible C/C++ syntax and type diagnostics.

Required diagnostic flow:

```text
latest editor content
  -> BeCoder-private temporary mirror
  -> bundled gcc/g++ -fsyntax-only
  -> structured GCC diagnostics
  -> Problems, squiggles, and editor diagnostics
```

Requirements:

- Use bundled `gcc` with C17 for C and bundled `g++` with C++20 for C++.
- Use structured, color-free compiler output, preferring GCC JSON diagnostics where supported.
- Never invoke a compiler through shell lookup, user `PATH`, registry discovery, or download fallback.
- Keep temporary diagnostic files under BeCoder data or temp storage, not in the user project.
- Preserve same-directory quoted-include behavior and map temporary-file locations back to the original document.
- Use a debounce and one active diagnostic request. A newer edit cancels the older diagnostic process; requests do not queue.
- Clear or mark stale diagnostics when content changes so old squiggles do not appear current.
- Run and diagnostic compilation are separate processes. Starting a real Run may cancel the lower-priority diagnostic process to avoid compiler contention, but must not share terminal or `Ctrl+C` state.
- Successful Run compilation results may replace the current diagnostic result for that source file.
- Syntax and type errors are required. The final warning policy remains an explicit product decision and must not be guessed during implementation.

Regression cases must cover valid C17 VLAs, `stdio.h`, `scanf`, valid C++20 concepts, `bits/stdc++.h`, `debugger.h`, an undeclared identifier, a type mismatch, a syntax error, relative includes, stale-result cancellation, and compiler-process failure.

### BeCoder Runner and BC Command Panel

BeCoder Runner is a dedicated Run and Run With Input surface. It is not a general shell and must remain isolated from native PowerShell.

Runner execution contract:

1. Save the focused C/C++ source file.
2. Resolve only the bundled BeCoder compiler.
3. Compile through a temporary executable path.
4. Place the runnable result at `<source-directory>\<source-basename>.exe` when compilation succeeds.
5. Run it with the source directory as working directory.
6. Delete it afterward when cleanup is enabled.

Run With Input contract:

- Accept only an ordinary same-directory file named exactly `input`.
- Reject missing input, a directory named `input`, `input.in`, `input.txt`, `main.in`, and files from other directories.
- Redirect the accepted file to standard input through the same compile/run lifecycle as Run.
- Sort an explorer item named exactly `input` to the top by default, unconditionally within its folder.

BC panel contract:

- Keep one Run button and one visually distinct Run With Input button. Button actions and typed BC commands must enter the same request state machine.
- Present a PowerShell-like prompt such as `BC D:\c++>`.
- Show commands such as `BC D:\c++> run template\heap.cpp` and `BC D:\c++> run template\heap.cpp -WithInput`.
- Use a closed command set: `run <source>`, `run <source> -WithInput`, `clear`, and `help`.
- Never execute arbitrary PowerShell, shell commands, scripts, pipelines, environment-variable operations, or PATH lookups.
- When a user treats BC as PowerShell, reject the command and show a clear popup explaining that BC is the BeCoder Run panel, not PowerShell.
- Keep one active Run request only. While compile, execution, or cancellation is active, reject a new request immediately.
- Do not queue requests and do not retain a latest pending request.
- `Ctrl+C` cancels the active compile or program, reaches a terminal cancellation state, and then returns the panel to ready.
- A new Run after completed cancellation must work without stale process, executable, request, result, current-directory, or terminal state.
- `Ctrl+C` must not cause an unexpected `cd` or mutate the next command.
- `Esc` clears the current input or cancels input editing; it does not cancel a running program.
- Reuse one BC panel instead of creating a new terminal window for each request.
- Preserve relative source paths in the visible command flow.

History and clearing:

- `Up` and `Down` browse accepted, executed BC commands in a PowerShell-like way.
- History exists in memory for the current BeCoder process only.
- Closing the BC panel with the trash action and reopening it clears visible output but preserves in-process command history.
- Restarting BeCoder clears BC history.
- History stores command text only, not output, stdin, rejected arbitrary commands, or rejected busy requests.

Runner process and environment requirements:

- Use BeCoder's private compiler path and private child-process environment.
- Preserve the accepted closed, case-sensitive compiler-flag policy and reject compiler-driver, linker, plugin, and external path controls.
- Scrub compiler-affecting environment variables around compiler and program children.
- Restore the Runner host environment after each child process.
- Do not modify system/user environment variables.
- Do not couple Runner cancellation to clangd, native PowerShell, or the GCC diagnostic worker's terminal state.

### Native PowerShell

Native PowerShell is the only terminal surface that accepts the user's normal system environment and arbitrary commands.

- Preserve the user's `PATH`, installed compilers, scripts such as `crd.ps1`, aliases, profiles, and normal terminal semantics.
- Do not force the bundled GCC into native PowerShell.
- Do not modify, delete, or overwrite user/system environment variables.
- Do not visually or semantically merge native PowerShell with the BC panel.

### Performance

Run performance target:

- `compileToRunStartMs = programSpawnTime - compilerSpawnTime` should be no more than approximately 2 seconds in the accepted test environment.
- Program runtime is not part of this target.
- Record `panelReadyMs`, `saveMs`, `compileMs`, `processStartMs`, `compileToRunStartMs`, `programRuntimeMs`, and `cleanupMs` separately.
- Measure first Run, warm Run, Run With Input, compile failure, cancellation, and rerun.
- Do not meet the target by weakening compiler isolation, skipping required compilation, or changing Run semantics.

Editor and language-service targets:

- TextMate must provide the final visible C/C++ coloring immediately, including files with `bits/stdc++.h`.
- clangd may continue preparing completion and navigation data in the background, but that work must not recolor the editor.
- Measure first completion, signature help, hover, definition, references, and rename readiness separately from visual completion.
- Avoid unnecessary competition between clangd parsing, GCC diagnostics, and Runner compilation.

### Extension Marketplace and Built-in Extension Policy

Marketplace requirements:

- Provide VS Marketplace search, browse, install, uninstall, and update in the Code - OSS workbench.
- Support local `.vsix` import.
- Users may install CPH, cpptools, other OJ tools, languages, and themes themselves.
- cpptools must not be prebundled or enabled as a BeCoder core dependency.

Core built-in policy:

- Maintain an explicit built-in allowlist and conflict/protection list.
- BeCoder Setup, BeCoder Runner, the managed clangd client, and BeCoder One Monokai are protected core extensions.
- Better C++ Syntax grammar content belongs to the built-in `extensions/cpp` language extension, not a second installed extension.
- User/workspace extensions must not replace protected core IDs in normal packaged use; extension-development instances remain usable for source debugging.
- Remove CodeSnap, JavaScript Debugger (`js-debug`), Mermaid, and other non-core prebundled extensions unless the project owner explicitly adds them to the allowlist.
- Do not restore ShortestPath login, online submission, network OJ services, or GDB.

Complete AI removal means removing the full feature chain, not merely hiding a panel:

- chat and agent views;
- commands, menus, keybindings, settings, configuration schemas, context keys, and startup contributions;
- AI entries in Settings;
- stale default-layout and persisted-state paths that can recreate the UI in clean or existing user data.

### Workbench and Product UI

Use `C:\Users\Bc\Desktop\BeCoder\vscode-1.130.0` as the interaction and visual reference where it does not conflict with BeCoder's product boundary.

- Add a clearly visible gear-shaped Settings entry with one unambiguous command/menu/icon owner.
- Correct About and View License presentation for BeCoder while preserving required legal notices.
- Remove Ask `@vscode` from Help.
- Remove the user-facing debug workbench, debug entry points, commands, views, menus, keybindings, settings, and GDB paths after dependency tracing.
- Preserve ordinary editing, terminal, build, extension, and language-service behavior after cleanup.
- Keep the requested terminal status visuals, including the left status indicator and red cancellation mark after `Ctrl+C`.
- Remove the first-run custom configuration page and start directly in the prepared BeCoder default state.

### Toolchain Slimming and Packaging

- Analyze real dependencies before removing any UCRT64 or clangd archive content.
- Remove only files proven unnecessary for offline C17/C++20 compilation, Run, GCC diagnostics, retained clangd intelligence, `stdc++.h.gch`, and `debugger.h`.
- Preserve the original LFS archives as recoverable sources before controlled reduction.
- Rebuild and test after every controlled reduction.
- Record compressed and extracted sizes.
- Do not optimize package size by depending on system compilers, PATH, registry state, downloads, or global configuration.

## 5. Important Source Locations

Setup and toolchain:

- `extensions/becoder.setup/src/extension.ts`
- `extensions/becoder.setup/src/toolchainDiagnostics.ts`
- `extensions/becoder.setup/resources/windows.js`
- `extensions/becoder.setup/resources/windows.json`
- `src/vs/code/electron-main/app.ts`

Runner and BC panel:

- `extensions/danielpinto8zz6.c-cpp-compile-run`
- `extensions/danielpinto8zz6.c-cpp-compile-run/resources/becoder-runner.ps1`

clangd:

- `extensions/llvm-vs-code-extensions.vscode-clangd/src/clangd-context.ts`
- `extensions/llvm-vs-code-extensions.vscode-clangd/package.json`

C/C++ visual system:

- `extensions/cpp/package.json`
- `extensions/cpp/syntaxes/cpp.tmLanguage.json`
- `extensions/cpp/syntaxes/cpp.embedded.macro.tmLanguage.json`
- Planned built-in theme location: `extensions/becoder.one-monokai`
- ShortestPath reference: `C:\Users\Bc\Desktop\BeCoder\shortestpath-ide-Release-v0.2.8`

Build and package verification:

- `build/azure-pipelines/win32/verify-becoder-package.ps1`
- `resources/oi-defaults/toolchains/`

## 6. Reusable Baseline and Required Migration

Commit `a8ac68f` contains useful isolation and performance work that Stage 4 must preserve where compatible:

- the single-`source.cpp` grammar regression;
- early, value-based portable toolchain path refresh;
- fixed bundled clangd executable selection without PATH, downloads, or update checks;
- private clangd environment roots;
- the LSP compilation-argument boundary that ignores hostile compilation databases;
- bundled GCC-compatible include and target path calculation;
- protected core extension IDs;
- Runner compiler-path validation, closed compiler flags, and child-environment scrubbing;
- stale-request and stopped-client isolation patterns that can be reused outside the removed semantic-token cache.

The following `a8ac68f` behavior is superseded and must be removed or migrated during Stage 4:

- clangd as a visible diagnostic authority;
- managed project `.clangd` generation and migration;
- reading ancestor `.clangd` files for semantic-token fingerprints;
- semantic-token persistence, restore, delta, invalidation, and refresh logic;
- clangd inactive-region and inlay-hint activation;
- diagnostic false-positive filters that are no longer needed when GCC owns diagnostics;
- background indexing that is unnecessary for the retained single-translation-unit OI feature set.

Do not remove reusable isolation work merely because the feature that originally consumed it is being simplified.

## 7. Validation and Acceptance Boundary

The standard Windows validation sequence is:

```powershell
npm run typecheck-client
npm run compile-oi-extensions
npm run gulp vscode-win32-x64-min
```

Use the timeout and stop rules in `AGENTS.md`. Do not use `npm run compile` for TypeScript validation. A non-zero exit or external timeout fails the step; do not automatically continue to packaging or runtime checks.

After a successful portable build, direct package verification may run with `-IncludeCompiler $true`. Build success proves compilation and packaging only. It does not prove GUI startup, first-run extraction, visual behavior, Runner interaction, or runtime isolation.

The project owner normally performs final GUI and portable acceptance. Unless explicitly requested, the coding agent must stop after source validation, package build, and direct package verification, then report the artifact path and exact checks completed.

The consolidated Stage 4 acceptance matrix includes:

- clean-profile startup directly into BeCoder defaults;
- automatic private toolchain extraction;
- final TextMate/One Monokai coloring without delayed semantic recolor;
- retained clangd completion, signature help, hover, definition/references, rename, and Google fallback formatting;
- no clangd diagnostics, semantic tokens, inactive regions, or inlay hints;
- GCC-only valid/invalid C17 and C++20 diagnostics;
- workspace `.clangd` left untouched and ignored by BeCoder;
- Run, Run With Input, cancellation, rerun, and no request queue;
- approximately two-second compile-to-run-start target;
- BC history, trash/reopen behavior, arbitrary-command rejection, and closed command set;
- exact `input` validation and default explorer pinning;
- native PowerShell retaining the user's environment and arbitrary-command behavior;
- marketplace and local `.vsix` behavior without protected-extension replacement;
- absence of AI, debug/GDB, ShortestPath network services, and removed non-core bundled extensions;
- BeCoder branding, Help entries, Settings gear, and terminal cancellation visuals;
- comparison with `portable_stage2_4_verified`, ShortestPath visual behavior, and the VS Code 1.130 reference where applicable.

## 8. Stage 4 Work Register

| Feature area | Status | Current handoff point |
| --- | --- | --- |
| Stage 4 specification consolidation | Source validated | The authoritative document is consolidated and structurally checked; commit and project-owner confirmation remain pending. |
| Better C++ Syntax single grammar | Archived | The pinned `071dd6e` snapshot is token-scope equivalent to ShortestPath's effective 1.27.1 grammar; the package contains one accepted `source.cpp` owner. |
| BeCoder One Monokai | Archived | The protected MIT-licensed `becoder.one-monokai` system extension is the accepted first-launch default. |
| clangd capability reduction | In progress | Semantic tokens, semantic-token caching, inlay hints, and inactive-region decorations are removed and package-validated; diagnostics, code actions, indexing, and other non-approved capabilities remain for later Stage 4 work. |
| Google formatting | Planned | Register document/range formatting through clangd with Google fallback style. |
| GCC diagnostics | Planned | Design and implement the private latest-only diagnostic worker and structured parser. |
| Runner and BC panel | Planned | Replace the generic terminal model with the closed BC interaction and robust cancellation state machine. |
| Run performance | Planned | Instrument phases and meet the approximate two-second compile-to-run-start target. |
| Explorer `input` ordering | Planned | Pin an exact `input` item to the top of each folder by default. |
| Marketplace and extension cleanup | Planned | Add Marketplace/VSIX support, define allowlists, and remove non-core bundled extensions. |
| AI/debug/GDB removal | Planned | Remove complete contribution and persisted-state chains after dependency tracing. |
| Workbench/branding alignment | Planned | Apply Settings, Help, terminal-status, first-run, and VS Code 1.130 alignment requirements. |
| Toolchain slimming and release | Planned | Begin only after retained compiler/language-service behavior is stable and measurable. |

### Visual system build checkpoint (2026-08-07)

- Grammar decision: Code - OSS registers built-in extensions in sorted path order, so ShortestPath's separate `jeff-hykin.better-cpp-syntax` extension overrides its earlier `extensions/cpp` registration. Structural comparison showed that its 1.27.1 grammar differs from BeCoder's pinned grammar only in generated metadata. Tokenizing eight representative OI C++ files (45,236 bytes, including `bits/stdc++.h`) produced the same token count and scope hash for both snapshots, so BeCoder retained the traceable `071dd6ecc9eda347bd84c8aa0e0b557396cb6a40` snapshot instead of adding or replacing an owner.
- Theme result: `becoder.one-monokai` owns the vendored One Monokai 0.5.0 theme and license, contributes `BeCoder One Monokai`, disables semantic highlighting in the theme and by default for C/C++/CUDA C++, and is protected from normal user/workspace replacement while extension-development overrides remain available.
- clangd visual boundary: the client no longer registers standard semantic-token or inlay-hint protocol features; custom semantic-token persistence, delta reconstruction, refresh, inactive-region decoration, and inlay-hint implementations and settings were removed. clangd remains otherwise unchanged until the later capability-reduction and GCC-diagnostics work.
- Source validation: clangd `check-ts` (including compilation of the real-client visual-feature registration test), 234 build-script tests, `typecheck-client`, and `compile-oi-extensions` passed. The focused workbench Node test could not run because this checkout intentionally has no generated `out/` test module, and the new clangd behavior test was not launched in an Electron extension-test host; no forbidden `npm run compile` was used.
- Package validation: the final post-review `gulp vscode-win32-x64-min` and enhanced `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. The verifier parsed the packaged theme identity and defaults, grammar commit and unique owner, onboarding entry, and both upstream licenses. Two rounds of independent read-only review passed after the first round's four findings were fixed.
- User acceptance: passed. The project owner confirmed that first-launch theme selection, theme persistence after switching and restart, and opening `bits/stdc++.h` files without delayed secondary coloring all match the required behavior.

## 9. Feature Archive

### Stage 4 C/C++ visual system

- Requirement: make a single Better C++ Syntax TextMate grammar and BeCoder One Monokai the complete C/C++ coloring authority, with no delayed clangd recolor.
- User-visible result: clean profiles use BeCoder One Monokai; C/C++ colors remain stable after file open; theme switching persists; semantic tokens, inlay hints, and inactive-region decorations do not alter the editor later.
- Source ownership: `extensions/cpp`, `extensions/becoder.one-monokai`, the clangd client visual boundary, theme defaults, onboarding theme selection, and package verification.
- Commit/PR: the containing Stage 4 backup commit, pushed directly to `origin/stage4`; no PR was requested.
- Source validation: clangd `check-ts`, 234 build-script tests, `typecheck-client`, `compile-oi-extensions`, focused boundary tests, and two independent read-only reviews passed.
- Package/build validation: `gulp vscode-win32-x64-min` and the enhanced Include Compiler package verifier passed.
- User acceptance: passed on 2026-08-07.
- Remaining risks or follow-up: the broader clangd capability reduction and GCC diagnostic migration remain active Stage 4 work and are not part of this archived visual feature.

### Baseline: Runner, toolchain, and language isolation

- Commits: `365318c`, `a8ac68f`
- Result: bundled compiler paths, private child environments, protected core extensions, one reusable Runner terminal, strict `input` validation, single C++ grammar protection, and portable package checks were implemented.
- Validation recorded at `a8ac68f`: precommit, 231 build-script tests, client typecheck, OI extension compilation, Windows portable Gulp build, package verification, focused clangd/setup/Runner checks, and read-only review passed.
- User acceptance: the project owner approved publishing the source checkpoint. Final GUI timing and portable runtime behavior were user-owned acceptance items; no agent-run GUI acceptance is claimed.
- Stage 4 impact: retain isolation and path ownership; replace the old managed `.clangd`, clangd diagnostics, and semantic-token architecture as specified above.

### Archive Entry Template

```markdown
### <Feature name>

- Requirement:
- User-visible result:
- Source ownership:
- Commit/PR:
- Source validation:
- Package/build validation:
- User acceptance:
- Remaining risks or follow-up:
```

## 10. Working Rules

- Read this document and `AGENTS.md` before Stage 4 implementation.
- Do not edit generated `out/`, `.build/`, `out-build/`, `out-vscode-min/`, extension `dist`/`out`, or dependency directories directly.
- Do not clean caches, dependencies, build output, portable packages, or user data during a normal build unless explicitly requested.
- Do not modify the stable reference package outside the repository.
- Do not change the user's Windows PATH or other environment variables.
- Do not stage unrelated or pre-existing working-tree changes.
- Ask before creating backup commits, pushing, opening a pull request, or changing release assets.
- Keep changes narrow and close to Code - OSS architecture.
- Add focused regression tests in proportion to each feature's risk.
- For difficult implementation, follow the independent read-only review loop in `AGENTS.md`.
- Update the Stage 4 work register during implementation and archive each feature immediately after it satisfies its required validation and acceptance boundary.
