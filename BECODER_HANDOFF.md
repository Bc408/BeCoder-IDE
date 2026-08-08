# BeCoder Project Handoff

This is the authoritative development handoff for BeCoder. Starting on 2026-08-07, all unfinished and newly approved work belongs to **Stage 4**. **Stage 4.4.1** is the latest archived implementation checkpoint; its protected Simplified-Chinese and bilingual-product behavior has passed source, package, and project-owner runtime acceptance. The broader **Stage 4.4** Open VSX and extension-governance checkpoint still has separately listed Marketplace and local-VSIX acceptance items pending. Earlier pre-Stage-4 labels are historical only and must not be used to split, prioritize, or infer current requirements.

The active requirements in this document override older implementation directions when they conflict. In particular, Stage 4 replaces the previous clangd-diagnostics, managed `.clangd`, and semantic-token-highlighting design.

## 1. Current Baseline

- Repository root: `C:\Users\Bc\Desktop\BeCoder\BeCoder_new`
- GitHub repository: `https://github.com/Bc408/BeCoder.git`
- Release branch: `main`
- Active development branch: `codex/stage4.4`
- Active baseline commit: `18e7f60` (`feat(stage4.3): refine runner and visual workflow`)
- Latest remote backup target: `origin/stage4.4.1`
- Current `main` commit: `c028603`
- Stable runtime reference: `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`
- The stable reference package is outside the repository and must not be modified.
- Open VSX implementation reference: `C:\Users\Bc\Desktop\BeCoder\vscodium-1.126.04524`; use its `prepare_vscode.sh` and extension documentation as a read-only compatibility reference rather than copying the VSCodium product wholesale.
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
| C/C++ visual highlighting | Immediate built-in TextMate coloring plus bounded clangd semantic refinement owned by BeCoder One Monokai |
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
- Allow users to install optional extensions later through the public Eclipse Open VSX Registry or a user-supplied local `.vsix` file.
- Remove the first-open custom configuration page and open directly with BeCoder defaults.
- Keep the fork close to upstream Code - OSS and implement BeCoder-specific behavior in focused built-in extensions or narrow integration points.

## 3. Stage 4 Management Rules

Stage 4 is one continuous product stage. Stage 4.3 is an archived development checkpoint label; remaining requirements are still tracked by named feature areas rather than treating the checkpoint as an independent product release.

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

The accepted visual architecture is **Better C++ Syntax grammar content for immediate first paint, followed by one bounded clangd semantic refinement owned by BeCoder One Monokai**. This Stage 4.3 decision supersedes the earlier rule that TextMate must remain the final and only coloring authority; the earlier archived checkpoint remains below as historical evidence of what was previously built and accepted.

Grammar requirements:

- Vendor the selected Better C++ Syntax grammar snapshot into the built-in `extensions/cpp` language extension.
- Keep exactly one `source.cpp` grammar owner.
- Do not restore the separately bundled `jeff-hykin.better-cpp-syntax` extension.
- Preserve and extend the existing regression test that rejects duplicate `source.cpp` owners.
- Record the selected upstream commit, MIT license, and third-party notice.
- Before replacing the current snapshot, compare the current grammar with the effective ShortestPath Better C++ Syntax grammar using representative OI code and token scopes.

Theme requirements:

- Add One Monokai as a BeCoder-owned built-in system extension, not an online-registry-managed dependency.
- Use a distinct built-in identity such as `becoder.one-monokai` and a visible label such as `BeCoder One Monokai`.
- Make it the first-launch default without forcing it again after a user selects another theme.
- Protect the built-in identity from replacement by a user or workspace extension while preserving extension-development overrides.
- Preserve the upstream MIT license and Joshua Azemoh copyright notice.
- Keep theme implementation in a built-in extension instead of hard-coding colors in workbench source.

Semantic-coloring boundary:

- Set `semanticHighlighting` to `true` in the BeCoder One Monokai theme and default `editor.semanticHighlighting.enabled` to `true` for `c`, `cpp`, and `cuda-cpp`. A user setting still takes precedence.
- Register only the standard language-client semantic-token provider. Do not restore custom persistence, fingerprinting, invalidation, delta reconstruction, cross-session caches, or a second BeCoder-owned token pipeline.
- Limit material semantic recoloring to functions/methods/macros in green, types/classes/interfaces/enums/type parameters/concepts in blue, parameters in italic orange, ordinary variables/properties in light gray, and default-library variables such as `cin`, `cout`, and `cerr` in blue.
- Do not add semantic theme rules for keywords, operators, brackets, numbers, strings, or comments; their established TextMate/One Monokai appearance remains the visual baseline.
- Remove the existing semantic-token persistence, fingerprint, invalidation, delta reconstruction, and background refresh paths.
- Opening a file must show complete readable TextMate coloring immediately. clangd may apply one stable semantic refinement after AST preparation, with an approximate visual target of no more than two seconds on the accepted machine.
- A file containing `#include <bits/stdc++.h>` must never remain blank, partially highlighted, or blocked while clangd prepares the semantic refinement.

Unicode-highlight defaults:

- BeCoder contributes `editor.unicodeHighlight.nonBasicASCII: false`, `editor.unicodeHighlight.ambiguousCharacters: false`, and `editor.unicodeHighlight.invisibleCharacters: true` as product defaults.
- These are extension-contributed defaults, not global-setting migrations: an existing profile without an explicit value inherits them, while an explicit user value such as `ambiguousCharacters: true` wins.
- Do not read or modify system VS Code settings. All BeCoder settings and data remain under BeCoder-owned directories.

Visual acceptance must include templates, macros, lambdas, structured bindings, concepts, STL types, `bits/stdc++.h`, `debugger.h`, C17 code, and large source files. Compare token scopes and screenshots against `C:\Users\Bc\Desktop\BeCoder\shortestpath-ide-Release-v0.2.8` and the approved reference image.

### clangd Code Intelligence and Google Formatting

clangd remains bundled. It is not a diagnostic authority, but its standard semantic-token provider is the bounded second-stage visual refinement described above.

The only clangd capabilities BeCoder exposes are:

- completion;
- signature help;
- hover;
- definition;
- references;
- prepare rename and rename;
- semantic tokens for bounded C/C++ visual refinement;
- document formatting and range formatting.

clangd must still preprocess includes and build an AST/Sema representation internally because the retained intelligence and semantic-refinement features require it. Existing optimizations that reduce startup, toolchain discovery, and header-analysis cost remain useful. This internal work must not block TextMate first paint or create repeated semantic recoloring.

Disable or remove the client paths for:

- diagnostics display and diagnostic false-positive filters;
- custom semantic-token caches, persistence, delta reconstruction, and refresh pipelines beyond the standard language-client provider;
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
- Formatting must not enable clangd diagnostics, broaden the approved semantic-token surface, or enable general code actions.

### Bundled GCC Editor Error Diagnostics

Bundled GCC is the sole authority for visible C/C++ syntax, preprocessing, and type errors in the editor.

Required diagnostic flow:

```text
latest editor content
  -> BeCoder-private temporary mirror
  -> bundled gcc/g++ -fsyntax-only
  -> structured GCC diagnostics
  -> filter error and fatal error records
  -> Problems, red squiggles, file badges, and overview-ruler markers
```

Requirements:

- Use bundled `gcc` with C17 for C and bundled `g++` with C++20 for C++.
- Use structured, color-free compiler output, preferring GCC JSON diagnostics where supported.
- Use `-DDEBUG`, `-finput-charset=UTF-8`, and `-fexec-charset=UTF-8` to match the accepted competitive-programming source semantics. Use `-fdiagnostics-color=never` because Stage 4.2 consumes JSON rather than rendering terminal text.
- Do not enable `-Wall`, extended warning flags, `-Werror`, or `-pedantic` in the Stage 4.2 background diagnostic command. Warning selection and colored compiler output belong to the later Runner/BC panel work.
- Publish only GCC `error` and `fatal error` records as `DiagnosticSeverity.Error`. GCC `warning` records must not enter the Stage 4.2 `DiagnosticCollection`, Problems, editor decorations, file badges, or counters. Notes may be attached only as related information to a published error and must not create their own markers.
- Publish valid structured errors even when GCC exits nonzero. A clean exit with no error records clears the current file's errors. Process exit code alone must never be converted into a source-code diagnostic.
- Never invoke a compiler through shell lookup, user `PATH`, registry discovery, or download fallback.
- Keep temporary diagnostic files under BeCoder data or temp storage, not in the user project.
- Preserve same-directory quoted-include behavior and map temporary-file locations back to the original document.
- Use a debounce and one active diagnostic request. A newer edit cancels the older diagnostic process; requests do not queue.
- Keep the last successfully accepted diagnostics while newer content is pending, then replace the complete owned result atomically. A canceled, stale, malformed, timed-out, or failed request must not clear or partially replace the accepted result.
- Run and diagnostic compilation are separate processes. Starting a real Run may cancel the lower-priority diagnostic process to avoid compiler contention, but must not share terminal or `Ctrl+C` state.
- Successful Run compilation results may replace the current diagnostic result for that source file.
- Syntax, preprocessing, and type errors are required editor diagnostics. Compiler and linker output, including all warnings, belongs to the later Runner/BC panel and is outside Stage 4.2.

The Run-to-diagnostic cancellation bridge and successful-Run result reuse are broader Stage 4 options, not Stage 4.2 implementation requirements. Stage 4.2 must remain independently correct without modifying or importing Runner state.

Regression cases must cover valid C17 VLAs, `stdio.h`, `scanf`, valid C++20 concepts, `bits/stdc++.h`, `debugger.h`, a missing include, an undeclared identifier, a type mismatch, a syntax error, error exit code nonzero, relative includes, stale-result cancellation, and compiler-process failure. Warning-only cases such as an unused variable and signed/unsigned comparison must prove that Stage 4.2 publishes no warning diagnostics.

Stage 4.2 implementation boundary:

- Implement diagnostics as a dedicated protected built-in extension, provisionally `extensions/becoder.gcc-diagnostics`; do not place the diagnostic state machine in BeCoder Setup, Runner, clangd, native PowerShell, or workbench core.
- BeCoder Setup remains responsible only for making the private toolchain available. The diagnostic extension resolves the packaged Windows compiler from BeCoder-owned data paths and must not trust a workspace setting, user compiler path, `PATH`, registry entry, or online-registry toolchain.
- Activate for saved file-backed C and C++ source documents. Diagnose the latest in-memory document text rather than the last saved disk contents; untitled documents and standalone header-as-translation-unit diagnostics are outside the first Stage 4.2 acceptance boundary.
- Own one `vscode.DiagnosticCollection` with source label `BeCoder GCC`. Publish only red errors after the matching request completes successfully; canceled, stale, malformed, and failed compiler requests must never overwrite a newer result.
- Use a short edit debounce and one global active compiler process. A newer eligible edit cancels the active process tree and replaces the pending debounce target. The latest target may become ready while the canceled process is retiring, but it must not start until the old process has actually closed. There is no FIFO queue and no retained pending history.
- Keep the entire diagnostic pipeline asynchronous. File open, TextMate coloring, typing, save, clangd startup, and editor readiness must never await GCC diagnostics; `bits/stdc++.h` may make a diagnostic result slower but must not reintroduce a visible highlighting wait or second coloring phase.
- Create one unique private temporary directory per request, write an exact text mirror, compile with `-fsyntax-only`, `-O2`, explicit `-x c` or `-x c++`, `-fdiagnostics-format=json`, `-fdiagnostics-color=never`, `-DDEBUG`, UTF-8 input/output charsets, C17 or C++20, `-iquote <source-directory>`, and private-to-source macro path mapping, then remove only that request's temporary directory after the process closes. `-O2` is required because the bundled `stdc++.h.gch` was built with that option and is rejected without it; explicit `-x` prevents mirror filename casing from changing GCC's language choice.
- Preserve same-directory quoted includes through the explicit `-iquote` path. Map only the temporary mirror path back to the original document URI; keep real included-header locations intact when GCC reports them.
- Parse GCC JSON as structured data. Convert GCC's one-based byte/display columns and inclusive ranges to VS Code's zero-based UTF-16 ranges, including non-ASCII source lines; attach compiler notes as related information to errors instead of creating unrelated primary squiggles. Filter by the structured `kind` field and do not infer severity from text, color, or process exit code. For a non-target included file, use only the disk text GCC actually read; suppress that location while its open editor buffer is dirty so disk byte columns are never mapped against different in-memory text.
- Spawn without a shell, with a BeCoder-private environment and temporary roots. Scrub compiler-affecting variables including `CPATH`, `CPLUS_INCLUDE_PATH`, `C_INCLUDE_PATH`, `COMPILER_PATH`, `GCC_EXEC_PREFIX`, `LIBRARY_PATH`, and `INCLUDE`.
- Keep diagnostic cancellation independent from Runner `Ctrl+C`, the BC panel, clangd, and native PowerShell. Stage 4.2 does not change Runner behavior; any later Run-to-diagnostic cancellation bridge must be one-way and must not share process or terminal state.
- Preserve the edited document's last accepted diagnostics during debounce and compilation so markers do not flicker; atomically replace them only when the matching latest request succeeds. Clear owned diagnostics when the document closes or becomes ineligible. Toolchain/process failures are logged without popup repetition and leave the last accepted result intact.
- Record `debounceWaitMs`, `compilerSpawnMs`, `gccMs`, `parseMs`, `publishMs`, cancellation count, and total edit-to-diagnostic latency in a developer-facing trace. Measure cold and warm valid files, `bits/stdc++.h`, error input, continuous typing, cancellation, and cross-file replacement before attempting optimization.
- Stage 4.2 guarantees syntax, preprocessing, and type errors only. It creates no terminal and publishes no warning diagnostics. The later Runner/BC panel work owns compiler warning flags, colored terminal presentation, compile-command interaction, and linker/runtime output.

Stage 4.2 user-visible contract:

- Mark each GCC source error with the native red editor squiggle at the mapped range. Do not draw custom decorations that compete with VS Code's marker service.
- Populate Problems with source `BeCoder GCC`, message, file, line, and column. Selecting a Problems entry must navigate to the reported range.
- Let the native marker service provide the red editor-tab count, Explorer file/folder problem count, minimap/overview-ruler marker, and Problems badge as in the accepted VS Code reference image.
- Do not force-open or focus the Problems panel. The user may keep Terminal or another panel active while the Problems badge and editor markers remain current.
- When the latest content has no GCC errors, remove all Stage 4.2 markers for that document. A warning-only document is error-clean and therefore has no Stage 4.2 marker or count.
- Do not create a terminal, print compiler output, show colored GCC text, or alter the BC panel/native PowerShell. Those visible compile results belong to the later Runner/BC panel work.

Stage 4.2 document-event contract:

| Event | Required behavior |
| --- | --- |
| Open an eligible saved `.c`, `.cc`, `.cpp`, or `.cxx` document | Schedule asynchronous error analysis after 1000 ms without delaying editor readiness. |
| Change eligible document text | Preserve the last accepted markers, schedule the latest content after 800 ms, replace the pending debounce target, and cancel an older active GCC process tree. |
| Save the document | Diagnose the saved version immediately when no identical current-version request has already completed or is active. A save replaces a pending debounce for the same version. |
| Switch to another eligible open document | Make the newly active document the latest diagnostic target; do not queue the previous target. Previously completed errors for an unchanged document may remain visible. |
| Close, delete, or rename a document | Cancel an owned request for the old URI and clear all owned markers for that URI. |
| Toolchain is not ready | Publish no synthetic source error, log the unavailable state once, preserve the last accepted markers, and retry the active eligible document when BeCoder Setup reports compiler readiness. |
| Extension deactivation or window shutdown | Cancel the compiler process tree, dispose the collection, and clean only diagnostic-owned temporary directories. |

A result may publish only when all of these remain true after GCC closes: the request is the latest request, it was not canceled, the document URI and version still match, the document remains eligible, the JSON is structurally valid, and the collection is still alive. Parse all top-level records but create primary markers only for `error` and `fatal error`; deduplicate identical file/range/message errors and attach their notes as related information.

Stage 4.2 validation must include parser fixtures for Windows paths, spaces, UTF-8 text, multi-location ranges, include stacks, error-associated notes, warning filtering, malformed output, and process failure; deterministic coordinator tests for debounce, replacement, process-tree cancellation, no queue, stale suppression, and per-request cleanup; raw bundled-GCC error probes; package verification for the new built-in extension; the standard Windows source/build sequence; independent read-only review; and project-owner portable GUI acceptance.

Stage 4.2 planning probe: the packaged bundled GCC 14.1.0 emitted a structured JSON error for an undeclared identifier with exit code 1. A separate warning probe confirmed that warnings are structurally distinguishable, so Stage 4.2 can reject them explicitly rather than relying on text parsing or exit status. `bits/stdc++.h` testing proved that omitting `-O2` invalidates the bundled PCH, while the exact Stage 4.2 arguments including `-O2` and `-fmacro-prefix-map` preserve it; a warm valid check completed in approximately 483 ms on the development machine.

Stage 4.2 archived checkpoint on 2026-08-07:

- Implemented the protected built-in `becoder.gcc-diagnostics` extension with a private mirrored-source GCC pipeline, strict latest-only single-process coordination, atomic result replacement, native error diagnostics, warning filtering, UTF-8 byte-to-UTF-16 mapping, cross-TU diagnostic ownership, bounded toolchain-readiness retry, and dependency-forced source rechecks after header save/delete/rename.
- Focused extension tests pass 24/24, including debounce/latest replacement, strict retirement before replacement start, forced same-version dependency invalidation, shared-header ownership, Windows/UTF-8 JSON parsing, fixed compiler arguments, abort plus dispose, timeout, output overflow, and spawn failure.
- `scripts/validate-gcc-diagnostics.ps1` passes against bundled GCC 14.1.0 for C17 VLA/`stdio.h`/`scanf`, C++20 concepts/`bits/stdc++.h`/`debugger.h`, syntax and undeclared-name errors, type mismatch, missing and relative includes, a clean warning-only Stage 4.2 invocation, and a separately structured `-Wall` warning probe.
- Final validation passes: OI extension boundary 5/5, `npm run typecheck-client`, `npm run compile-oi-extensions`, `npm run gulp vscode-win32-x64-min`, and `verify-becoder-package.ps1 -IncludeCompiler $true`. Packaged GCC diagnostic JavaScript SHA-256 values match the current extension output.
- The same independent read-only reviewer completed three review rounds. Two rounds found and drove fixes for process overlap, dependency invalidation, process termination idempotence, dirty-header mapping, file lifecycle, toolchain retry, and test realism; the third round passed with no remaining source blocker.
- Current portable package: `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. The project owner completed portable GUI acceptance and fully accepted the Stage 4.2 delivery on 2026-08-07.

### BeCoder Runner and BC Command Panel

BeCoder Runner is a dedicated Run and Run With Input surface. It is not a general shell and must remain isolated from native PowerShell.

Future BC panel compiler-output contract:

- Warning and compiler-output presentation is owned by the Runner/BC panel stage, not Stage 4.2.
- Follow the established `crd` experience: generally compile with `-Wall -DDEBUG -finput-charset=UTF-8 -fexec-charset=UTF-8 -fdiagnostics-color=always`, merge stderr into the BC panel output, and preserve GCC's familiar colored terminal formatting.
- Do not add the Stage 4.2 background diagnostic JSON stream to the BC panel, and do not make BC panel warning output create editor warning markers unless the project owner later requests that behavior.

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
- Render the `BC <cwd>>` prompt in the terminal's default gray, normalize a Windows drive letter to uppercase for display, keep accepted BC command names such as `run` in bright yellow, render the source-file argument in bright white, and render `-WithInput` in the default foreground. Illegal command text becomes red only after it is clearly outside the closed grammar.
- Use the parser-owned ranged tokenizer for both execution and coloring so quoted paths, command history, button-injected commands, and typed commands cannot disagree visually or semantically.
- Emit native terminal OSC 633 prompt/command lifecycle markers so the BC transcript receives PowerShell-like command decorations and left-side success/error circles. Strip OSC 633 sequences from compiler and program output across chunk boundaries while preserving ordinary ANSI GCC color output.
- Frame Runner lifecycle messages as `===== <Message> =====`. After successful compilation and actual program spawn, print green `===== Compilation Successful, Running =====`. Print green `===== Run Complete =====` for exit code zero, red `===== Runtime Error (exit code N) =====` for a nonzero program exit, and green `===== Executable Program Removed =====` only after cleanup actually succeeds. Do not add the historical yellow Chinese warning banner.
- Compilation failures retain GCC's colored output and do not print `Runtime Error`. Active-command `Ctrl+C` emits no synthetic `^C` line, finishes the OSC 633 command with a nonzero status so its left-side circle becomes red, and must not be classified as a runtime error.

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

Stage 4.3 implementation boundary:

- Replace the generic integrated-PowerShell host with a BeCoder-owned `Pseudoterminal`. The BC panel may look and edit like PowerShell, but it must never start or embed PowerShell, `cmd`, another shell, or a user profile.
- Spawn the bundled compiler and compiled program directly from the Runner extension with `shell: false`. Remove the PowerShell request file, result polling, terminal-startup wait, and command-script chain from the active implementation.
- Keep one process-local controller and one reusable BC panel. The controller owns command history across panel trash/reopen, while a BeCoder process restart naturally clears it.
- Route editor buttons and typed BC commands through the same parser and single-active-request gate. Busy requests are rejected immediately and are never queued or retained as pending work.
- Stream GCC ANSI output and program output directly into the BC panel. Keep `-Wall`, `-DDEBUG`, UTF-8 input/execution charsets, and always-colored diagnostics in the Runner compile command without publishing warning diagnostics to the editor.
- Keep interactive Run stdin inside the BC panel and redirect the exact same-directory `input` file only for Run With Input. `Ctrl+C` owns only the active Runner compiler/program tree; `Esc` owns only line editing.
- Measure panel readiness, save, compiler spawn/compile, program spawn, compile-to-run-start, runtime, and cleanup without printing development metrics into the normal BC transcript.
- Pin an exact ordinary file named `input` before every other item in its Explorer folder regardless of the configured name/type/directory/reverse sort mode. No other spelling is pinned.
- Stage 4.3 source validation must cover command parsing, arbitrary-command rejection, line editing and history, strict busy rejection/no queue, cancellation retirement before reuse, exact input validation, private compiler arguments/environment, timing records, and Explorer ordering. Portable GUI acceptance remains project-owner owned.

Stage 4.3 source and package checkpoint on 2026-08-07 through 2026-08-08:

- The Runner now owns a shell-free `Pseudoterminal`, a closed `run`/`run -WithInput`/`clear`/`help` parser, process-local command history, immediate busy rejection without a queue, direct compiler/program spawning, streamed ANSI output and interactive stdin, and Runner-only process-tree cancellation. The former PowerShell scripts, JSON polling, startup delay, Promise queue, and obsolete configuration path are removed from the active extension.
- Compiler policy keeps fixed `-O2`, `-Wall`, `-DDEBUG`, UTF-8 charset, and colored-diagnostic arguments authoritative. Additional flags cannot replace optimization, diagnostics, plugin, linker, compiler-driver, or external path controls; compiler and program children receive a private allowlisted environment.
- Exact same-directory ordinary-file validation owns Run With Input. The Explorer comparator pins only an exact ordinary file named `input` before every sibling in all supported sort and reverse modes.
- The visual closeout keeps Better C++ Syntax/TextMate as the immediate first paint and restores only clangd's standard semantic-token provider for one bounded refinement. BeCoder One Monokai owns the semantic colors; clangd diagnostics, inlay hints, inactive regions, code actions, custom token persistence, delta reconstruction, and refresh machinery remain absent.
- BeCoder-local configuration defaults disable non-basic and ambiguous Unicode highlighting while retaining invisible-character highlighting. Explicit user settings still win, and no system VS Code setting is read or changed.
- The BC panel now uses parser-owned command coloring, PowerShell-style prompt coloring, uppercase Windows drive display, and OSC 633 command lifecycle markers. Compiler and program output cannot inject OSC 633 across chunk, C1, or mixed-introducer boundaries, while normal GCC ANSI diagnostics remain colored. Successful runs, runtime failures, compilation failures, cancellation, missing executables, and cleanup each retain distinct status behavior.
- GCC editor diagnostics use `-DDEBUGER_H` plus an extension-owned `diagnostic-include/bits/debugger.h` compatibility override. This prevents the bundled debug header from injecting `using namespace std` while preserving `debug(value)` and direct or repeated `bits/debugger.h` inclusion. The correctness-first path deliberately invalidates the bundled C++ PCH and measured approximately 1.5 seconds in the focused raw-GCC probe; replacing the toolchain PCH is a later optimization, not a correctness blocker.
- Focused validation passed: Runner strict TypeScript checking, production webpack compilation, Runner tests 38/38, GCC diagnostics tests 24/24, bundled GCC C/C++ namespace and debugger-header matrix, client TypeScript checking, build tests 236/236, clangd `check-ts` and `test-compile`, `compile-oi-extensions`, and the existing Stage 4.3 Explorer Electron tests 5/5.
- The independent read-only review completed four post-acceptance detail rounds. It drove fixes for debugger-header direct/repeated inclusion, package verification of the namespace-isolation header and bundle arguments, Ctrl+C coverage, and non-drive prompt-path coverage; the final round passed with no findings.
- The replacement `npm run gulp vscode-win32-x64-min` build passed on 2026-08-08 in 145.5 seconds. Direct `verify-becoder-package.ps1 -IncludeCompiler $true` verification then passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`, including the Runner bundle, diagnostics override header, and bundled compiler.
- User acceptance: passed on 2026-08-08. The project owner confirmed that the complete Stage 4.3 behavior meets the requirements and approved the checkpoint for archive.
- Status: archived. Source checks, independent review, replacement build, direct package verification, and project-owner portable GUI acceptance are complete; no agent-run GUI acceptance is claimed.

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

- TextMate must provide complete readable C/C++ coloring immediately, including files with `bits/stdc++.h`.
- clangd may apply one bounded semantic refinement after AST preparation; target approximately two seconds or less on the accepted machine and avoid repeated or broad visual churn.
- Measure first completion, signature help, hover, definition, references, and rename readiness separately from visual completion.
- Avoid unnecessary competition between clangd parsing, GCC diagnostics, and Runner compilation.

### Open VSX Registry and Built-in Extension Policy

Registry requirements:

- Use the public Eclipse Open VSX Registry as BeCoder's only product-configured online extension registry. Provide search, browse, install, uninstall, and update through the normal Code - OSS Extensions workbench.
- Follow the proven VSCodium 1.126 integration shape: Open VSX gallery, item, latest-version, trusted-domain, and Eclipse extension-control endpoints. Reconcile the exact fields with BeCoder's newer Code - OSS baseline instead of copying obsolete endpoint templates blindly.
- Remove `marketplace.visualstudio.com`, `vscode-unpkg.net`, Microsoft Marketplace PPE, Microsoft Marketplace control, and other Microsoft Marketplace delivery endpoints from the packaged product configuration. BeCoder must not provide a Microsoft Marketplace preset, automatic fallback, proxy, mirror, or user-facing switch.
- Support user-supplied local `.vsix` import as the fallback for extensions that are absent from Open VSX. Do not fetch such VSIX files from Microsoft Marketplace on the user's behalf.
- Users may install CPH, other OJ tools, languages, and themes themselves when their licenses permit use in BeCoder. The currently expected `DivyanshuAgrawal.competitive-programming-helper` entry is absent from Open VSX, so CPH acceptance must exercise the local VSIX path rather than silently changing registries.
- Treat Open VSX as an open, vendor-neutral registry service, not as proof that every listed extension is open source. Keep publisher, source, license, trust, compatibility, and security information visible; user-installed extensions remain third-party content under their own terms and must not be rebundled into BeCoder automatically.
- Download user-selected Open VSX extensions directly into BeCoder-owned user data. Do not operate a BeCoder extension mirror or redistribute the Open VSX catalog. Preserve the Eclipse extension-control feed and Code - OSS integrity, malicious-extension, publisher-trust, and compatibility checks where supported by the selected API.
- Keep `ms-vscode.cpptools` and `ms-vscode.cpptools-extension-pack` in the product extension blacklist. BeCoder must not bundle, download, install, update, enable, or run cpptools through either Open VSX or local `.vsix` paths. This latest decision supersedes the earlier plan to allow optional user installation.

Core built-in policy:

- Maintain an explicit built-in allowlist and conflict/protection list.
- The protected core IDs are `becoder.becoder-setup`, `becoder.runner`, `becoder.gcc-diagnostics`, `becoder.one-monokai`, `llvm-vs-code-extensions.vscode-clangd`, `adpyke.codesnap`, `vscode.cpp`, and `ms-ceintl.vscode-language-pack-zh-hans`.
- Preserve the current bundled CodeSnap extension at `extensions/aadityanarayan.code-snap` with extension ID `adpyke.codesnap`. CodeSnap is an archived BeCoder-distributed core capability at the same management level as BeCoder One Monokai, not a dependency to remove and reinstall from Open VSX.
- Protect the built-in `adpyke.codesnap` and `vscode.cpp` identities from replacement by user or workspace extensions in normal packaged use while preserving extension-development overrides, and add focused install-policy, deduplication, and package-verifier coverage for the complete protected set.
- Better C++ Syntax grammar content belongs to the built-in `extensions/cpp` language extension, not a second installed extension.
- User/workspace extensions must not replace protected core IDs in normal packaged use; extension-development instances remain usable for source debugging.
- Remove `ms-vscode.js-debug`, `ms-vscode.js-debug-companion`, `ms-vscode.vscode-js-profile-table`, and `vscode.mermaid-markdown-features` from the BeCoder distribution. Prefer narrow build/package exclusions over deleting upstream source trees. CodeSnap is explicitly excluded from this cleanup.
- Do not restore ShortestPath login, online submission, network OJ services, or GDB.

Built-in language policy:

- Bundle the exact unmodified extension payload from `ms-ceintl.vscode-language-pack-zh-hans-1.130.2026072017.vsix` as the protected system extension `ms-ceintl.vscode-language-pack-zh-hans`; pin version `1.130.2026072017`, VS Code engine `^1.130.0`, SHA-256 `265536b3db2bdcc01e764679da8fb6d7ceaa7a7f3bb35c8b53dd0db51e8707f0`, source provenance, MIT license, and third-party notice.
- Keep the bundled Simplified Chinese pack at the same product-management level as CodeSnap and BeCoder One Monokai. Normal Open VSX search/results, update, install, uninstall, user/workspace replacement, and profile-copy paths must not expose or replace its protected identity; extension-development overrides remain available for source work.
- BeCoder defaults to `zh-cn` on a fresh profile. English uses the Code - OSS source messages and must not require or install an English language extension.
- Contribute `becoder.displayLanguage` as the first `application`-scoped setting under `BeCoder IDE Features`, with exactly `zh-cn` and `en`; the `BeCoder IDE: Settings` command must open the `becoder.becoder-setup` settings page where this control is visible.
- A language change first writes the BeCoder-owned `argv.json` preference and then offers `Restart` or `Later`. `Later` keeps the selected language for the next BeCoder launch. Only one change is active and only the latest pending selection is retained; a failed write or unavailable protected pack restores the last accepted setting.
- Store the setting in BeCoder's local user configuration and use only BeCoder's user-data and extension directories. Do not inspect, copy, migrate, or modify system VS Code locale settings, extensions, or user data.
- On startup, the main process may load the bundled Chinese pack directly so a fresh profile does not depend on a pre-existing `languagepacks.json`; the shared-process language-pack scan remains responsible for refreshing BeCoder's own cache for subsequent switching.
- BeCoder-owned Settings, New Tab, Setup/toolchain diagnostics, Runner command labels, and GCC Diagnostics extension metadata must remain coherent in both Chinese and English. The Stage 4.3 BC command grammar and accepted PowerShell-style lifecycle/status text remain stable English terminal protocol text.

Redistribution and licensing gate:

- BeCoder's GPL-3.0-or-later project license does not replace third-party licenses. Keep an auditable bundled-component inventory containing the exact component/version or commit, source URL, modification status, SPDX identifier, copyright notice, license-file path, archive hash, and corresponding-source location where copyleft terms require it.
- Correct the BeCoder Runner entry in `ThirdPartyNotices.txt` from version 0.2.0 to the bundled 0.3.0 and retain its GPL-3.0 license and modified source.
- CodeSnap may remain core, but Stage 4.4 must add a complete MIT license text and defensible upstream copyright/provenance record to both source and package output; the manifest's bare `MIT` field is not the complete redistribution record.
- Record the bundled clangd 22.1.6 binary separately from the MIT-licensed vscode-clangd client. Preserve its `Apache-2.0 WITH LLVM-exception` license from the archive and record the exact archive provenance and hash.
- Treat `resources/oi-defaults/toolchains/becoder-ucrt64.zip` as an urgent compliance item because it is already distributed through Git LFS. Inventory the exact MSYS2 binary packages, remove unrelated components only through the controlled toolchain-slimming workflow, retain every required license and notice, and provide durable equivalent access to exact corresponding sources, PKGBUILDs, patches, and hashes for GPL/LGPL components. Do not rewrite Git history or delete the accepted archive merely to conceal the gap; repair the distribution forward.
- A Stage 4.4 package must fail verification if a bundled core component or toolchain lacks its required license/provenance record, if the Runner notice version is stale, or if packaged product configuration still references Microsoft Marketplace delivery endpoints.

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
- On a clean BeCoder profile, the first launch must show generated `.exe` files and dot-prefixed configuration files/folders in the left Explorer by default so beginning competitive programmers can see the executable produced by compilation.
- The Explorer action named `Hide Configuration and Executable Files` must hide both dot-prefixed files/folders such as `.vscode`, `.clangd`, and `.clang-format` through `**/.*`, and BeCoder-managed executable/binary artifacts such as `**/*.exe`. The paired `Show All Files` action must remove only those BeCoder-managed hide patterns and preserve unrelated user exclusions.
- BeCoder Setup must not add these hide patterns during first launch or ordinary setup. Hiding begins only after the user explicitly invokes the Explorer action, and the action state must remain consistent with the effective BeCoder-managed patterns.

### Toolchain Slimming and Packaging

- Analyze real dependencies before removing any UCRT64 or clangd archive content.
- Remove only files proven unnecessary for offline C17/C++20 compilation, Run, GCC diagnostics, retained clangd intelligence, `stdc++.h.gch`, and `debugger.h`.
- Preserve the original LFS archives as recoverable sources before controlled reduction.
- Rebuild the retained toolchain from an exact, reproducible package manifest rather than another manually copied UCRT64 directory. Preserve source-package identities, build recipes, patches, license directories, and checksums alongside the reduced archive.
- Generate a machine-readable software bill of materials and a human-readable third-party license bundle for the compiler archive. Corresponding-source availability is a release requirement, not an optional documentation improvement.
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

Open VSX and extension governance:

- `product.json`
- `src/vs/platform/extensionManagement/common/allowedExtensionsService.ts`
- `src/vs/platform/extensionManagement/common/extensionGalleryService.ts`
- `src/vs/platform/extensionManagement/common/abstractExtensionManagementService.ts`
- `src/vs/platform/extensionManagement/test/common/allowedExtensionsService.test.ts`

Display language and bilingual product UI:

- `extensions/MS-CEINTL.vscode-language-pack-zh-hans`
- `extensions/becoder.setup/package.json`
- `extensions/becoder.setup/src/localize.ts`
- `extensions/becoder.setup/src/toolchainDiagnostics.ts`
- `src/main.ts`
- `src/vs/base/node/nls.ts`
- `src/vs/workbench/contrib/becoder/electron-browser/beCoderDisplayLanguage.contribution.ts`
- `src/vs/workbench/services/localization/electron-browser/localeService.ts`
- `src/vs/workbench/contrib/extensions/browser/extensionsWorkbenchService.ts`
- `src/vs/workbench/services/extensionManagement`
- `build/gulpfile.vscode.ts`
- `build/azure-pipelines/win32/verify-becoder-package.ps1`
- `ThirdPartyNotices.txt`

Runner and BC panel:

- `extensions/danielpinto8zz6.c-cpp-compile-run`
- `extensions/danielpinto8zz6.c-cpp-compile-run/resources/becoder-runner.ps1`

clangd:

- `extensions/llvm-vs-code-extensions.vscode-clangd/src/clangd-context.ts`
- `extensions/llvm-vs-code-extensions.vscode-clangd/package.json`

GCC diagnostics:

- Active owner: `extensions/becoder.gcc-diagnostics`
- Toolchain readiness reference only: `extensions/becoder.setup`
- Packaged compiler-location reference: `extensions/danielpinto8zz6.c-cpp-compile-run/src/compiler.ts`

C/C++ visual system:

- `extensions/cpp/package.json`
- `extensions/cpp/syntaxes/cpp.tmLanguage.json`
- `extensions/cpp/syntaxes/cpp.embedded.macro.tmLanguage.json`
- Planned built-in theme location: `extensions/becoder.one-monokai`
- ShortestPath reference: `C:\Users\Bc\Desktop\BeCoder\shortestpath-ide-Release-v0.2.8`

Protected built-in extensions:

- `extensions/aadityanarayan.code-snap`
- `src/vs/workbench/services/extensions/common/extensionsUtil.ts`
- `src/vs/workbench/services/extensions/test/common/extensionsUtil.test.ts`

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
- immediate TextMate/One Monokai first paint followed by one bounded clangd semantic refinement;
- retained clangd completion, signature help, hover, definition/references, rename, and Google fallback formatting;
- no clangd diagnostics, inactive regions, inlay hints, or semantic-token persistence/custom refresh machinery;
- GCC-only valid/invalid C17 and C++20 diagnostics, with red error markers and Problems entries but no Stage 4.2 warning markers;
- workspace `.clangd` left untouched and ignored by BeCoder;
- Run, Run With Input, cancellation, rerun, and no request queue;
- approximately two-second compile-to-run-start target;
- BC history, trash/reopen behavior, arbitrary-command rejection, and closed command set;
- exact `input` validation and default explorer pinning;
- generated `.exe` files and dot-prefixed configuration items visible in Explorer by default on a clean first launch, with the explicit hide/show action correctly toggling both groups;
- native PowerShell retaining the user's environment and arbitrary-command behavior;
- Open VSX search, browse, install, update, and uninstall plus local `.vsix` behavior without protected-extension replacement or Microsoft Marketplace access;
- CPH local-VSIX fallback when the expected extension remains absent from Open VSX;
- cpptools blocked consistently through Open VSX, local VSIX, enablement, update, and existing-install paths;
- CodeSnap remaining bundled, functional, licensed in the package, and protected from normal user/workspace replacement without Open VSX reinstallation;
- clean-profile Simplified-Chinese startup from the pinned built-in 1.130 pack, English source-message fallback, `BeCoder IDE Features` language switching, `Restart`/`Later` persistence, and no access to system VS Code settings;
- the protected Chinese pack, CodeSnap, One Monokai, and other core identities remaining absent from normal Open VSX results and immune to user/workspace replacement;
- BeCoder New Tab, Setup/toolchain diagnostics, extension commands, and settings labels presenting coherent Chinese and English while BC terminal protocol text keeps the accepted Stage 4.3 appearance;
- packaged third-party inventory, notices, toolchain licenses, archive provenance, and corresponding-source records passing the redistribution gate;
- absence of AI, debug/GDB, ShortestPath network services, and removed non-core bundled extensions;
- BeCoder branding, Help entries, Settings gear, and terminal cancellation visuals;
- comparison with `portable_stage2_4_verified`, ShortestPath visual behavior, and the VS Code 1.130 reference where applicable.

## 8. Stage 4 Work Register

| Feature area | Status | Current handoff point |
| --- | --- | --- |
| Stage 4 specification consolidation | Archived | The authoritative Stage 4 requirements and ownership boundaries are consolidated, committed, and accepted by the project owner. |
| Better C++ Syntax single grammar | Archived | The pinned `071dd6e` snapshot is token-scope equivalent to ShortestPath's effective 1.27.1 grammar; the package contains one accepted `source.cpp` owner. |
| BeCoder One Monokai | Archived | The protected MIT-licensed `becoder.one-monokai` system extension is the accepted first-launch default. |
| CodeSnap core retention | Archived | Bundled `adpyke.codesnap` remains a BeCoder-distributed core capability and is excluded from Open VSX migration or non-core cleanup. Open-VSX-era same-ID replacement protection remains owned by Stage 4.4. |
| clangd capability reduction | Archived | Stage 4.1 exposes only completion, signature help, hover, definition, references, rename, and document/range formatting; source, package, and project-owner acceptance passed. |
| Google formatting | Archived | Stage 4.1 uses clangd's embedded ClangFormat with Google fallback, accepts only a physical workspace `.clang-format` override, and ships no separate `clang-format.exe`; source, package, and project-owner acceptance passed. |
| GCC editor error diagnostics | Archived | Stage 4.2 source, focused tests, raw bundled-GCC matrix, standard Windows build, direct package verification, package/source hash comparison, independent review, and project-owner portable GUI acceptance passed. |
| Runner and BC panel | Archived | The accepted replacement package contains the shell-free BC panel, framed lifecycle messages, PowerShell-aligned prompt and command colors, uppercase Windows drive display, and Ctrl+C command decorations. |
| Run performance | Archived | Stage 4.3 removes terminal startup/result polling from the hot path, records phase metrics, and passed project-owner portable acceptance. |
| Explorer `input` ordering | Archived | Stage 4.3 source, Electron tests, and project-owner acceptance prove that only an exact ordinary file named `input` is pinned above every sibling under all Explorer sort modes. |
| Stage 4.3 visual closeout | Archived | The accepted visual architecture, BC detail refinements, and GCC namespace-isolation correction passed focused validation, final read-only review, replacement build, direct package verification, and project-owner acceptance. |
| Explorer visibility toggle | Planned | Default to showing `.exe` and dot-prefixed configuration items; make `Hide Configuration and Executable Files` hide both groups and `Show All Files` restore them without changing unrelated user exclusions. |
| Stage 4.4 Open VSX and extension governance | Built; user acceptance pending | Source uses only Open VSX, enforces the cpptools blacklist and eight-ID core protection across install/enablement/dedup paths, excludes Mermaid and the three JS Debug downloads, and records bundled licenses plus UCRT64 provenance and corresponding source. Focused tests, the standard source/build sequence, direct package verification, independent package-content cross-checks, and final read-only review pass; only project-owner portable runtime acceptance remains pending. |
| Stage 4.4.1 protected Chinese and bilingual UI | Archived | The pinned 1.130 Simplified-Chinese VSIX is the eighth protected core component, fresh profiles default to Chinese, English uses source messages, `BeCoder IDE Features` owns the two-language setting, changes persist before optional restart, protected gallery results are hidden, and BeCoder-owned settings/toolchain surfaces are bilingual. Focused boundary tests 9/9, full build-script tests 239/239, client typecheck, OI extension compilation, JSON/PowerShell parsing, `git diff --check`, independent review, the replacement Windows build, direct package verification, and project-owner runtime acceptance pass. |
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
- Later decision: Stage 4.3 intentionally reintroduces only the standard clangd semantic-token provider for a bounded second-stage refinement. This does not invalidate the archived first-paint, theme, grammar, or no-custom-cache results, but it supersedes the archived prohibition on all delayed semantic recoloring.

### Stage 4.1 clangd and formatting build checkpoint (2026-08-07)

- Capability boundary at this checkpoint: the bundled client exposed only completion, signature help, hover, definition, references, prepare rename/rename, document formatting, and range formatting. Stage 4.3 later adds only standard semantic tokens; diagnostics, inlay hints, inactive regions, code actions, clang-tidy, workspace symbols, background indexing, AST/memory/type-hierarchy UI, header switching, formatting on type, configuration UI/watchers, downloads, updates, external paths, and the public raw client API remain removed or blocked.
- Managed process: BeCoder starts only its bundled clangd with `--compile_args_from=lsp`, `--enable-config=false`, `--fallback-style=Google`, `--header-insertion=never`, and `--clang-tidy=false`. C17/C++20 compilation commands are sent through the LSP boundary before each document is opened; completion cannot insert include directives.
- Configuration ownership: BeCoder no longer creates, reads, hides, migrates, rewrites, or deletes workspace `.clangd` files and does not consume `compile_commands.json`. Legacy BeCoder-owned private-profile settings and obsolete hide rules receive a one-time migration without deleting user project assets or later user-created exclusions.
- Formatting boundary: formatting uses clangd's embedded ClangFormat engine and ships no standalone `clang-format.exe`. Google is the fallback; only a readable physical `.clang-format` inside the opened workspace may override it. `_clang-format`, escaping symlinks, ancestor/system/profile configuration, and `InheritParentConfig` are rejected, and no configuration file or directory is generated.
- Source validation: clangd `npm run check-ts` and `npm run test-compile`, 234 build-script tests, the lockfile orphan check, `git diff --check`, the package-verifier parser check, and a raw bundled-clangd C++20 LSP probe passed. The standard `npm run typecheck-client` and `npm run compile-oi-extensions` checks also passed. `test-compile` compiled the extension-host tests but did not execute them.
- Review: three independent read-only review rounds completed; the third round confirmed all previously reported findings were closed.
- Package validation: `npm run gulp vscode-win32-x64-min` completed in approximately 2 minutes 13 seconds, then `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`.
- User acceptance: passed on 2026-08-07. The project owner confirmed satisfaction with the retained clangd intelligence, Google formatting, and absence of the removed clangd diagnostic and visual features, and judged that Stage 4.1 fully met its target. No agent-run GUI acceptance is claimed.
- Remaining work: GCC-owned diagnostics, the BC Runner/panel, Run performance, Explorer `input` ordering, extension cleanup, workbench cleanup, and toolchain slimming remain separate Stage 4 feature areas.

## 9. Feature Archive

### Stage 4 specification consolidation

- Requirement: replace conflicting historical stage directions with one authoritative Stage 4 product definition, ownership boundary, work register, acceptance matrix, and archive process.
- User-visible result: subsequent work has one stable source of truth for visual authority, clangd, GCC diagnostics, Runner/BC, native PowerShell, extensions, workbench cleanup, and packaging.
- Source ownership: `BECODER_HANDOFF.md` and `AGENTS.md`.
- Commit/PR: specification consolidation commit `e9d4a25`, followed by accepted Stage 4, Stage 4.1, and Stage 4.2 checkpoints; no PR was requested for the direct backup branches.
- Source validation: the document was structurally reviewed and then used to complete and archive the visual, clangd/formatting, and GCC diagnostic feature areas.
- Package/build validation: not independently applicable to a documentation-only feature; subsequent Stage 4 package builds validated the governed implementation boundaries.
- User acceptance: explicitly approved for archive by the project owner on 2026-08-07.
- Remaining risks or follow-up: keep the work register and archive entries current as Stage 4.3 and later features complete.

### CodeSnap core retention policy

- Requirement: retain bundled CodeSnap as a BeCoder core capability at the same distribution level as BeCoder One Monokai, rather than removing it for Open VSX reinstallation.
- User-visible result: `adpyke.codesnap` remains bundled and available in BeCoder without an Open VSX install.
- Source ownership: `extensions/aadityanarayan.code-snap`; normal-install replacement protection belongs to Stage 4.4 Open VSX and extension governance.
- Commit/PR: CodeSnap is present from source baseline commit `58816f2`; the retention decision is recorded in the Stage 4 handoff and requires no Stage 4.3 source rewrite.
- Source validation: current source and package policy retain the bundled extension; Stage 4.4 Open VSX and local-VSIX validation must prove that a user/workspace copy cannot replace the protected built-in identity.
- Package/build validation: prior accepted portable packages include the bundled CodeSnap extension.
- User acceptance: explicitly approved for archive by the project owner on 2026-08-07.
- Remaining risks or follow-up: implement and test same-ID protection before Open VSX installation is enabled; do not classify that work as part of this archived retention decision.

### Stage 4.1 clangd intelligence and Google formatting

- Requirement: reduce bundled clangd to the approved code-intelligence and formatting closed set, remove clangd diagnostics and visual authority, isolate it from project/system configuration, and provide Google-style document and selection formatting without a separate formatter executable.
- User-visible result: BeCoder retains completion, signature help, hover, definition, references, rename, and explicit formatting; clangd no longer contributes diagnostics, semantic recoloring, inlay hints, inactive regions, code actions, indexing UI, or configuration surfaces. Workspace `.clangd` files remain untouched and ignored, while an explicit workspace-contained `.clang-format` may override the Google fallback.
- Source ownership: `extensions/llvm-vs-code-extensions.vscode-clangd`, `extensions/becoder.setup`, the Electron-main legacy migration, build boundary tests, package verification, and first-run documentation.
- Commit/PR: the containing Stage 4.1 backup commit, pushed directly to `origin/stage4.1`; no PR was requested.
- Source validation: clangd `check-ts` and `test-compile`, 234 build-script tests, lockfile orphan validation, client typecheck, OI extension compilation, a raw bundled-clangd C++20 LSP probe, and three independent read-only review rounds passed. The extension-host tests were compiled but not executed.
- Package/build validation: `gulp vscode-win32-x64-min` and `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`.
- User acceptance: passed on 2026-08-07; the project owner reported that the result perfectly met the Stage 4.1 target.
- Remaining risks or follow-up: GCC diagnostics, Runner/BC panel work, Run performance, Explorer `input` ordering, extension/workbench cleanup, and toolchain slimming remain separate Stage 4 work. No agent-run GUI or extension-host test execution is claimed.

### Stage 4 C/C++ visual system

- Requirement: make a single Better C++ Syntax TextMate grammar and BeCoder One Monokai the complete C/C++ coloring authority, with no delayed clangd recolor.
- User-visible result: clean profiles use BeCoder One Monokai; C/C++ colors remain stable after file open; theme switching persists; semantic tokens, inlay hints, and inactive-region decorations do not alter the editor later.
- Source ownership: `extensions/cpp`, `extensions/becoder.one-monokai`, the clangd client visual boundary, theme defaults, onboarding theme selection, and package verification.
- Commit/PR: the containing Stage 4 backup commit, pushed directly to `origin/stage4`; no PR was requested.
- Source validation: clangd `check-ts`, 234 build-script tests, `typecheck-client`, `compile-oi-extensions`, focused boundary tests, and two independent read-only reviews passed.
- Package/build validation: `gulp vscode-win32-x64-min` and the enhanced Include Compiler package verifier passed.
- User acceptance: passed on 2026-08-07.
- Remaining risks or follow-up: the broader clangd capability reduction and GCC diagnostic migration remain active Stage 4 work and are not part of this archived visual feature.
- Superseding follow-up: Stage 4.3 preserves this archived TextMate first-paint and One Monokai ownership, but replaces the historical "no semantic recolor" rule with one bounded standard clangd semantic refinement. No custom token persistence or cache is restored.

### Stage 4.3 Runner, visual refinement, diagnostics correction, and Explorer ordering

- Requirement: deliver the shell-free BC command panel and direct bundled-compiler process path; preserve immediate TextMate coloring with one bounded clangd semantic refinement; isolate GCC editor diagnostics from the bundled debugger header's global namespace import; and pin an exact ordinary `input` file first in Explorer.
- User-visible result: Run and Run With Input are immediate, single-request BC operations with process-local history, PowerShell-aligned command decorations and colors, uppercase Windows drive display, framed lifecycle messages, correct runtime-error and Ctrl+C behavior, and no arbitrary shell execution. Editor diagnostics require normal namespace qualification, while valid debugger-header use remains supported. Explorer pins only the exact ordinary `input` file.
- Source ownership: `extensions/danielpinto8zz6.c-cpp-compile-run`, `extensions/becoder.gcc-diagnostics`, `extensions/becoder.one-monokai`, the reduced clangd semantic-token boundary, `extensions/becoder.setup`, the Explorer comparator and tests, build boundary tests, and package verification.
- Commit/PR: the containing Stage 4.3 backup commit is pushed directly to `origin/stage4.3`; no PR or release workflow was requested.
- Source validation: Runner tests 38/38, GCC diagnostics tests 24/24, bundled GCC C/C++ namespace/debugger-header matrix, build tests 236/236, Explorer Electron tests 5/5, client typecheck, OI extension compilation, clangd checks, Runner production bundling, `git diff --check`, and four final independent read-only review rounds passed.
- Package/build validation: the replacement Windows portable build passed on 2026-08-08 in 145.5 seconds, followed by successful `verify-becoder-package.ps1 -IncludeCompiler $true` verification for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`.
- User acceptance: passed on 2026-08-08; the project owner reported that Stage 4.3 fully meets the requirements and approved it for archive.
- Remaining risks or follow-up: the GCC namespace-isolation path deliberately invalidates the bundled C++ PCH and measured approximately 1.5 seconds in the focused probe. The Explorer visibility toggle is newly planned: first launch shows `.exe` and dot-prefixed items, while the explicit hide action must hide both groups. Open VSX governance and license remediation, AI/debug removal, broader Workbench alignment, and toolchain slimming remain separate Stage 4 work.

### Stage 4.4 Open VSX and extension governance implementation checkpoint

- Requirement: use the public Eclipse Open VSX Registry as BeCoder's only configured online extension registry; retain local VSIX import; block cpptools; prevent normal user, workspace, gallery, resource, or profile-copy replacement of the eight protected core IDs; remove Mermaid and the three downloaded JS Debug extensions from the OI package; and close bundled-component and UCRT64 redistribution records without deleting user assets or relying on Microsoft Marketplace.
- User-visible result: the normal Code - OSS Extensions workbench targets Open VSX for search, browse, install, update, and uninstall. Local VSIX remains available for extensions absent from Open VSX. `ms-vscode.cpptools` and its extension pack remain unavailable, while Runner, Setup, GCC Diagnostics, One Monokai, clangd, CodeSnap, and `vscode.cpp` retain their built-in identities. Extension-development overrides remain intentionally available for development.
- Source ownership: `product.json`; extension gallery, allowed-extension, installation, enablement, and dedup services under `src/vs/`; `build/hygiene.ts`; `build/lib/extensions.ts`; `build/azure-pipelines/win32/verify-becoder-package.ps1`; `ThirdPartyNotices.txt`; bundled extension licenses; and `resources/oi-defaults/BUNDLED-COMPONENTS.json` plus the UCRT64 package, license, and corresponding-source inventories.
- Commit/PR: included in the containing Stage 4.4.1 backup commit pushed directly to `origin/stage4.4.1`; no PR or release workflow was requested. `build/npm/stubs/cpu-features/` is unrelated user-owned untracked content and remains untouched and uncommitted.
- Source validation: the focused OI boundary suite passes 8/8 and the full build-script suite passes 238/238. JSON parsing, PowerShell parsing, `git diff --check`, direct lint of the new profile-copy test, Open VSX extension-query/latest/control endpoint probes, 38-package PKGBUILD hashes, 38-package license mappings, and all 36 normalized recipe-directory hashes pass. Git attributes explicitly fix 289 recipe text files to LF and the sole `.tar.xz` to binary; all 290 current files match their canonical Git-filtered bytes. The final post-build independent read-only review confirms that the narrow recipe-dotfile copy, extension-governance chain, license/provenance records, and package-verifier boundary have no remaining P1/P2 issue.
- Package/build validation: passed on 2026-08-08. `npm run typecheck-client`, `npm run compile-oi-extensions`, and `npm run gulp vscode-win32-x64-min` completed in order; the replacement Windows portable build completed in approximately 140 seconds. `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. An independent package-content cross-check found exactly 290 source and 290 packaged recipe files, including all six recipe `.gitignore` files, with identical relative paths and SHA-256 hashes; the obsolete packaged `.clangd` and duplicate portable-data toolchain placeholder are absent, and the packaged notice files match their source hashes.
- User acceptance: pending. No agent-run GUI was launched. Open VSX workbench behavior, local VSIX acceptance including CPH, protected/blacklisted install UX, update/uninstall flows, and the portable package remain project-owner acceptance items.
- Remaining risks or follow-up: the new native profile-copy behavior test is authored and typechecked but has not yet run from generated unit-test output. Future additions of new recipe file types must add an explicit `.gitattributes` rule before updating `filesSha256`. Stage 4.4 must not be archived until project-owner portable runtime acceptance passes.

### Stage 4.4.1 protected Simplified Chinese and bilingual product checkpoint

- Requirement: vendor the project-owner-supplied 1.130 Simplified-Chinese VSIX as a protected core component; default fresh BeCoder profiles to Chinese; use Code - OSS source messages for English; expose an easy two-language selector under `BeCoder IDE Features`; keep locale state entirely inside BeCoder data; hide the protected pack from online gallery results; and keep BeCoder-owned product surfaces coherent in both languages.
- User-visible result: `becoder.displayLanguage` offers only `简体中文` and `English` as the first BeCoder IDE setting. The BeCoder settings command opens that page. A selection is persisted to BeCoder's `argv.json` before the user chooses `Restart` or `Later`, and rapid changes retain only the latest pending language. Setup/toolchain pages and extension command/settings metadata have Chinese and English resources, while the accepted BC terminal protocol remains unchanged.
- Source ownership: `extensions/MS-CEINTL.vscode-language-pack-zh-hans`; `extensions/becoder.setup`; Runner and GCC Diagnostics package NLS files; `src/main.ts`; `src/vs/base/node/nls.ts`; the BeCoder display-language workbench contribution; localization services; protected extension/gallery policy; build boundary tests; package verification; bundled-component inventory; and third-party notices.
- Commit/PR: the containing Stage 4.4.1 backup commit is pushed directly to `origin/stage4.4.1`; no PR or release workflow was requested.
- Source validation: focused OI boundary tests pass 9/9 and full build-script tests pass 239/239. `npm run precommit`, `npm run typecheck-client`, `npm run compile-oi-extensions`, manifest/resource JSON parsing, package-verifier PowerShell parsing, Git attribute checks, and the complete staged-diff check pass. The precommit closeout preserves exact third-party snapshot bytes, validates only the approved Open VSX endpoints, and makes no user-visible behavior change. Independent read-only review found and then verified closure of protected-resource access, filtered-gallery pagination, superseded restart, retry-after-cancellation, and language-pack byte-boundary issues; the final review reports no remaining P1/P2. The approved VSIX archive hash, its 101-file source-tree hash, and the deterministic Code OSS JSON-minified package-tree hash are pinned separately. The display-language and gallery-pager workbench unit tests are authored and typechecked but are not yet executed from generated unit-test output.
- Package/build validation: passed on 2026-08-08. The final replacement `npm run gulp vscode-win32-x64-min` build completed in approximately 119 seconds, then `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. The verifier recomputed the packaged language pack's 101-file tree, core protection set, bundled licenses, component inventory, and compiler/toolchain hashes.
- User acceptance: passed on 2026-08-08. The project owner confirmed satisfaction after verifying clean-profile Chinese startup, Chinese-to-English and English-to-Chinese switching with both immediate restart and `Later`, persistence across restart, the visible settings entry, bilingual BeCoder surfaces, protected-pack invisibility, and complete isolation from system VS Code settings. No agent-run GUI acceptance is claimed.
- Remaining risks or follow-up: the pinned language pack is compatible with the current 1.130 baseline; future Code - OSS baseline upgrades must update and re-audit the bundled pack as a product component rather than accepting Open VSX replacement or automatic updates. The broader Stage 4.4 Marketplace and local-VSIX acceptance matrix remains separate and is not implicitly archived by this language checkpoint.

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
