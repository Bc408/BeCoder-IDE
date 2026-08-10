# BeCoder Stage 4 Development Record

> Historical archive. This file preserves the former monolithic handoff at the time the project documentation was restructured. It contains current-at-the-time plans, historical Portable evidence, superseded requirements, and detailed validation records. It is not the live handoff. Read repository-root `BECODER_PHILOSOPHY.md`, `BECODER_CURRENT.md`, and the relevant `docs/contracts/` document before using this record.

This is the authoritative development handoff for BeCoder. Starting on 2026-08-07, all unfinished and newly approved work belongs to **Stage 4**. **Stage 4.6** is the latest archived implementation checkpoint. Stage 4.4 Open VSX and extension governance, Stage 4.4.1 protected Simplified-Chinese and bilingual-product behavior, Stage 4.5 AI/Debug/GDB removal, and Stage 4.6 terminal-suggestion/SCM removal have passed source, package, and project-owner runtime acceptance. Earlier pre-Stage-4 labels are historical only and must not be used to split, prioritize, or infer current requirements.

The active requirements in this document override older implementation directions when they conflict. In particular, Stage 4 replaces the previous clangd-diagnostics, managed `.clangd`, and semantic-token-highlighting design.

## 1. Current Baseline

- Repository root: `C:\Users\Bc\Desktop\BeCoder\BeCoder_new`
- GitHub repository: `https://github.com/Bc408/BeCoder.git`
- Release branch: `main`
- Active development branch: `codex/stage4.7`
- Active baseline commit: `928aec1` (`feat(stage4.6): remove terminal suggestions and source control`)
- Latest remote backup target: `origin/stage4.6`
- Current `main` commit: `c028603`
- Stable runtime reference: `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`
- The stable reference package is outside the repository and must not be modified.
- Open VSX implementation reference: `C:\Users\Bc\Desktop\BeCoder\vscodium-1.126.04524`; use its `prepare_vscode.sh` and extension documentation as a read-only compatibility reference rather than copying the VSCodium product wholesale.
- Stage 4.6 removed the untracked `build/npm/stubs/cpu-features/` directory and restored the root dependency metadata to the Code - OSS 1.130 optional-dependency model. The local stub must not be recreated, staged, or packaged.

The bundled toolchain archives are intentional Git LFS assets:

- `resources/oi-defaults/toolchains/becoder-ucrt64.zip`
- `resources/oi-defaults/toolchains/clangd-windows-22.1.6.zip`

Do not replace these archives with extracted directories. Preserve `.gitattributes`, LFS pointers, `LICENSE`, `ThirdPartyNotices.txt`, and all third-party license files.

## 2. Product Definition and Philosophy

BeCoder is a self-contained Windows editor for C and C++ competitive programming, focused on OI and ICPC workflows. Its source is derived from Code - OSS, but its product behavior, release boundary, support documents, and user guidance are owned by BeCoder.

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
- Do not bundle CPH, cpptools, GDB, external OJ services, a BeCoder-owned/default AI account chain, online submission, or ShortestPath network services. Preserve the generic `vscode.authentication` API, extension-provided authentication providers, OAuth callbacks, secure credential storage, and ordinary extension account access.
- Allow users to install optional extensions later through the public Eclipse Open VSX Registry or a user-supplied local `.vsix` file.
- Remove the first-open custom configuration page and open directly with BeCoder defaults.
- Keep the fork close to upstream Code - OSS and implement BeCoder-specific behavior in focused built-in extensions or narrow integration points.

## 3. Stage 4 Management Rules

Stage 4 is one continuous product stage. Stage 4.3 is an archived development checkpoint label; remaining requirements are still tracked by named feature areas rather than treating the checkpoint as an independent product release.

Feature statuses are:

- **Planned**: requirement accepted, implementation not started.
- **In progress**: source work has started but the feature is not complete.
- **Source validated**: implementation and relevant source tests pass.
- **Built**: the staged Windows application, direct package verification, Setup build, and direct Setup verification pass.
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
- Archived Stage 4.2 package: `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. The project owner completed portable GUI acceptance and fully accepted the Stage 4.2 delivery on 2026-08-07. This path is historical evidence, not the current Stage 4.7 release candidate.

### BeCoder Runner and BC Command Panel

BeCoder Runner is a dedicated Run and Run With Input surface. It is not a general shell and must remain isolated from native PowerShell.

BC panel compiler-output contract:

- Warning and compiler-output presentation is owned by the Runner/BC panel stage, not Stage 4.2.
- Follow the established `crd` experience: generally compile with `-Wall -DDEBUG -finput-charset=UTF-8 -fexec-charset=UTF-8 -fdiagnostics-color=always`, merge stderr into the BC panel output, and preserve GCC's familiar colored terminal formatting.
- Do not add the Stage 4.2 background diagnostic JSON stream to the BC panel, and do not make BC panel warning output create editor warning markers unless the project owner later requests that behavior.

Runner execution contract:

1. Save the focused C/C++ source file.
2. Resolve only the bundled BeCoder compiler.
3. Compile through a temporary executable path.
4. Place the runnable result at `<source-directory>\<source-basename>.exe` when compilation succeeds.
5. Run it with the source directory as working directory.
6. Apply the mandatory terminal-owned executable cleanup protocol after execution, with the documented cancellation and terminal-closure preservation exceptions.

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
- `Ctrl+C` cancels the active compile or program, reaches a terminal cancellation state, preserves any executable already published by that request, and then returns the panel to ready.
- A new Run after completed cancellation must work without stale process, request, result, current-directory, or terminal state. A published executable intentionally retained by cancellation is not stale state; the next Run may silently remove it as the normal pre-compilation replacement step.
- `Ctrl+C` must not cause an unexpected `cd` or mutate the next command.
- `Esc` clears the current input or cancels input editing; it does not cancel a running program.
- Reuse one BC panel instead of creating a new terminal window for each request.
- Preserve relative source paths in the visible command flow.
- Render the `BC <cwd>>` prompt in the terminal's default gray, normalize a Windows drive letter to uppercase for display, keep accepted BC command names such as `run` in bright yellow, render the source-file argument in bright white, and render `-WithInput` in the default foreground. Illegal command text becomes red only after it is clearly outside the closed grammar.
- Use the parser-owned ranged tokenizer for both execution and coloring so quoted paths, command history, button-injected commands, and typed commands cannot disagree visually or semantically.
- Emit native terminal OSC 633 prompt/command lifecycle markers so the BC transcript receives PowerShell-like command decorations and left-side success/error circles. Strip OSC 633 sequences from compiler and program output across chunk boundaries while preserving ordinary ANSI GCC color output.
- Frame Runner lifecycle messages as `===== <Message> =====`. After successful compilation and actual program spawn, print green `===== Compilation Successful, Running =====`. Print green `===== Run Complete =====` for exit code zero and red `===== Runtime Error (exit code N) =====` for a nonzero program exit. After normal completion or Runtime Error, remove the newly published workspace executable and print green `===== Executable Program Removed =====` only after verified deletion. A non-cancellation launch failure after publication follows the same explicit removal rule. Executable cleanup is mandatory and is not a user setting.
- Do not expose an executable-retention or cleanup-delay setting. The obsolete `becoder.executableCleanupDelaySeconds` and its bilingual labels are removed because they contradict the mandatory terminal-owned cleanup protocol.
- Workspace executable deletion is a BC terminal protocol event, with two deliberate exceptions. Removing an old target immediately before compilation is the implementation of normal overwrite and remains silent. Removing random executables and other artifacts inside Runner's private ASCII session root is an internal build detail and remains silent. Error-path workspace cleanup is represented by the matching yellow flow block rather than an additional green removal line.
- The four flow failures are fixed English two-line yellow blocks and must reset terminal color after the description: `Unable to Start` / `Old .exe is in use, run cancelled, close it and retry`; `Compilation Failed` / `No executable remains, build artifacts removed`; `Executable Creation Failed` / `New .exe creation failed, build artifacts removed, no stale executable will run`; and `Cleanup Failed` / `Could not remove .exe, close the related process and retry`.
- Flow-failure selection is strict. Failure to remove an old target before compilation emits only `Unable to Start` and does not spawn GCC. A compiler failure emits `Compilation Failed` only after the target, private compiler output, publication staging, and all request-owned executable artifacts are absent. A missing compiler output or publication failure emits `Executable Creation Failed` only after the same cleanup boundary succeeds. Any required error-path cleanup failure emits `Cleanup Failed` instead of a message that claims removal. No path may emit both `Cleanup Failed` and `Executable Program Removed`.
- Active-command `Ctrl+C` emits no synthetic `^C`, cancellation label, Runtime Error, or executable-removal line. It preserves an already published workspace executable, finishes the OSC 633 command with a nonzero status so its left-side circle becomes red, and returns directly to the BC prompt. Closing or trashing the BC terminal and shutting down BeCoder use the same preservation rule because a workspace executable must never be deleted after its terminal can no longer report that deletion.
- Compilation failures retain GCC's colored output and do not print `Runtime Error`. Cleanup is scoped to the current source's target, target-volume publication staging, and that request's private session root; Runner never traverses or deletes another workspace executable, source file, input file, or user tool. Do not add the historical yellow Chinese warning banner.

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
- Remove `ms-vscode.js-debug`, `ms-vscode.js-debug-companion`, and `ms-vscode.vscode-js-profile-table` from the BeCoder distribution. Stage 4.5 supersedes the earlier Mermaid exclusion: `vscode.mermaid-markdown-features` is an ordinary bundled Markdown-reading component and is not downloaded from Open VSX. CodeSnap is explicitly excluded from this cleanup.
- Do not restore ShortestPath login, online submission, network OJ services, or GDB.

Built-in language policy:

- Use `ms-ceintl.vscode-language-pack-zh-hans-1.130.2026072017.vsix` as the pinned upstream source for the protected system extension `ms-ceintl.vscode-language-pack-zh-hans`; retain version `1.130.2026072017`, VS Code engine `^1.130.0`, original VSIX SHA-256 `265536b3db2bdcc01e764679da8fb6d7ceaa7a7f3bb35c8b53dd0db51e8707f0`, source provenance, MIT license, and third-party notice. Stage 4.5 removes translations for product surfaces that BeCoder no longer ships, so the bundled tree is an explicitly recorded BeCoder-modified derivative rather than a byte-identical copy of the VSIX.
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

### Stage 4.5 AI, Debug, and GDB Removal

Status: **Archived**. Stage 4.5 starts from commit `5130bbc` on branch `codex/stage4.5`. Client type checking, the 16-case focused boundary suite, bundled OI extension compilation, independent read-only review, the Windows portable build, and direct package verification with the bundled compiler passed on 2026-08-09. The project owner then completed portable GUI/runtime acceptance and approved Stage 4.5 for archive. The remaining native-terminal initial suggestion hint and Source Control product surface are separate Stage 4.6 requirements and do not reopen the accepted Stage 4.5 boundary.

The governing principle is:

> BeCoder does not support or preserve AI as a product capability. Remove BeCoder's AI product paths from runtime, compilation, build, and packaging, while preserving ordinary Workbench infrastructure even when upstream AI code once consumed it.

The implementation target is a zero product-dependency graph, not a zero keyword count or maximum source deletion count. A component is removed only when it provides BeCoder AI, Chat, Agent, Agent Sessions, language-model, MCP, Debug Workbench, or GDB product capability, or remains on a compiled, registered, exposed, or packaged path for one of those capabilities. Do not classify a component solely because its source contains words such as `ai`, `chat`, `agent`, `attach`, or `debug`.

Required product removal:

- Remove AI, Chat, Agent, Agent Sessions, language-model, and MCP runtime registrations, services, commands, menus, settings, context keys, window routes, product configuration, extension-host protocols, extension API and contribution points, build entry points, runtime dependencies, prompts, skills, media, and packaged resources.
- Remove the unregistered upstream `welcomeOnboarding` experiment as an AI-only source and media owner; retain BeCoder's generic product theme list and the independently owned One Monokai default-theme path.
- Remove the Debug Workbench, its views, panels, commands, menus, settings, extension contribution surface, bundled debug extensions, and every packaged `gdb.exe`.
- Remove Default Account, Copilot entitlement/quota/SKU/tracking logic, AI Account Policy Gate, Copilot Managed Settings, MCP registry/account preferences, Web Content Extractor, Agent Network Filter, and the Browser View CDP/Playwright product-automation channel.
- Do not add AI-specific Null, Empty, or Stub services; serializers; migrations; state keys; compatibility layers; history cleanup; or future restoration interfaces.
- Do not read, recognize, transform, migrate, or clean historical AI state. Generic Workbench recovery for unknown editors and missing views remains unchanged and contains no AI-specific branch.
- User extensions must not regain removed Chat, Agent, language-model, MCP, or Debug product capabilities through extension API or manifest contribution points.

Required retained infrastructure:

- Preserve generic `vscode.authentication`, extension Authentication Providers, login/logout/account selection, OAuth callbacks, secure credential storage, and ordinary extension access to GitHub or other services. Open VSX remains usable without a BeCoder account.
- Preserve Browser View and ordinary interactive web browsing, including third-party AI websites. BeCoder provides those pages no AI integration, content extraction, CDP access, Playwright control, or automatic interaction.
- Preserve `src/vs/base/browser/htmlToMarkdown.ts`, its generic tests, and its `htmlToMarkdown` Trusted Types policy entry. Removed Chat paste consumers and Web Content Extractor paths stay removed.
- Preserve generic Quick Access, `attach`, `isExplicit`, Markdown, terminal, editor, notebook, testing, search, policy, configuration, and extension infrastructure when it has an ordinary non-AI consumer.
- Preserve native-terminal process and shell identification needed for ordinary CLI programs. Remove only Agent-specific title detection and presentation.
- Preserve Playwright as development/test infrastructure only. It must not be a BeCoder runtime dependency or packaged browser-automation service.
- Preserve repository-only development metadata and tools that do not compile into or ship with BeCoder. Pure unreachable upstream AI source may remain only when it has no static import, type, registration, build, runtime, or package dependency from the product.
- Preserve and bundle `extensions/mermaid-markdown-features` as the built-in `vscode.mermaid-markdown-features` Markdown-reading component. Retain fenced Mermaid rendering in ordinary Markdown previews, Markdown-It integration, theme adaptation, zoom, source copying, standalone diagram preview, and Notebook Markdown-cell rendering.
- Use `C:\Users\Bc\Desktop\BeCoder\shortestpath-ide-Release-v0.2.8` as the read-only behavioral reference for this retained Mermaid path. Its ordinary Markdown preview script, Markdown-It plugin, Notebook renderer, and standalone diagram preview establish the positive baseline; ShortestPath login, OJ, network, Chat, and AI product paths remain out of scope.
- Preserve the generic Images Preview editor and its Explorer `Open in Images Preview` action. Remove only `imageCarousel.chat.enabled`, `workbench.action.chat.openImageInCarousel`, and their Chat-only translations; do not exclude the whole `imageCarousel` module or its ordinary fixtures from compilation.

Mermaid has a mixed upstream implementation and therefore uses a component boundary instead of directory-level removal:

- Keep the manifest contributions and build outputs for `markdown.previewScripts`, `markdown.markdownItPlugins`, `notebookRenderer`, ordinary Markdown preview, Notebook rendering, shared diagram rendering, and the standalone `vscode.mermaid-markdown-features.preview` webview.
- Remove the `chatOutputRenderers` contribution, `chatOutputRenderer` API proposal, `vscode.chat.registerChatOutputRenderer`, `ChatOutputDataItem`, `ChatOutputWebview`, `LanguageModelTextPart`, `LanguageModelToolResult`, the `text/vnd.mermaid` Chat protocol, Chat history restoration, Chat-only context-menu conditions, and Chat-only resources.
- If the standalone diagram preview reuses files currently named `preview-src/chat` or `chat-webview-out`, move or rename that shared implementation to a neutral diagram-preview owner. Do not delete ordinary preview behavior because of an obsolete directory or output name.
- Keep `vscode.mermaid-markdown-features` Simplified-Chinese translations and remove only `vscode.mermaid-chat-features` translations. Preserve the extension's upstream license, third-party notices, and dependency-license records.
- Package verification must require the Mermaid Markdown extension, Markdown and Notebook bundles, and ordinary preview assets while rejecting Chat API usage, Chat output contributions, Chat-only bundles, Chat output protocols, and AI resources.

Implementation discipline and current correction points:

- Classify the Stage 4.5 diff by product entry, extension API, shared infrastructure, build/dependency, localization, and verification ownership before further broad deletion.
- Review shared files by their consumers and import graph. Restore any ordinary capability that was removed only because an AI feature called it.
- Keep generic helpers extracted from deleted mixed modules when ordinary packaging or Workbench consumers still require them. New helper/widget files must receive focused tests and be tracked as intentional source changes.
- Do not use repository-wide keyword deletion or keyword-only package assertions. Boundary tests must target explicit modules, registrations, schemas, product fields, imports, outputs, and resources, and must include positive assertions for retained generic capabilities.
- The protected Simplified-Chinese pack must remain coherent with English product source. If Stage 4.5 filters AI/Debug translations from the pinned 1.130 payload, record it honestly as a BeCoder-modified derivative, preserve upstream MIT provenance, and recompute both source and packaged-content hashes. Do not continue describing the filtered payload as byte-identical to the supplied VSIX.

Stage 4.5 validation gates:

1. Focused boundary tests prove both removal and retention: no product AI/Debug/GDB registrations or extension surfaces; generic Authentication, Browser View, `htmlToMarkdown`, Quick Access attachment behavior, ordinary terminal identification, and Testing call-stack presentation remain.
2. `npm run typecheck-client` passes under the 120-second timeout.
3. The Stage 4.5 build-boundary test passes without broad false-positive keyword rules.
4. `npm run compile-oi-extensions` passes under the 120-second timeout.
5. The same independent read-only reviewer checks requirement completeness, ordinary-feature regressions, dependency closure, localization/provenance, package rules, and test coverage; findings are fixed and re-reviewed.
6. `npm run gulp vscode-win32-x64-min` passes under the 300-second timeout, followed by `verify-becoder-package.ps1 -IncludeCompiler $true`.
7. The final package contains Browser View but no Web Content Extractor or automation channel; contains generic Authentication but no AI account chain; contains the built-in Mermaid Markdown/Notebook renderer but no Mermaid Chat output chain; contains no AI/Chat/Agent/MCP runtime or independent resources; contains no Debug Workbench or `gdb.exe`.
8. After source checks and package verification, stop and hand the portable package to the project owner. Do not launch BeCoder or claim GUI/runtime acceptance. Archive Stage 4.5 only after project-owner acceptance.

### Stage 4.6 Terminal Suggestion and Source Control Removal

Status: **Archived**. Stage 4.6 started from archived commit `505d026` on branch `codex/stage4.6`. Client and build-script type checking, bundled OI extension compilation, the Simplified-Chinese boundary verifier, the focused Stage 4.6 test, the complete 17-case OI boundary suite, all 223 build-script tests, repeated independent read-only review, the Windows portable build, and direct package verification with `-IncludeCompiler $true` passed on 2026-08-09. The project owner then completed portable GUI/runtime acceptance and approved Stage 4.6 for archive.

Historical closeout note: when Stage 4.6 was archived, repository-wide `valid-layers-check` still reported a pre-existing direct `ipcMain` dependency in `src/vs/code/electron-main/app.ts`. Stage 4.7 subsequently removed the obsolete first-run IPC owner and the check now passes. The finding is closed and is not current technical debt.

Stage 4.6 first closes the local `cpu-features` dependency debt. Remove the root direct development dependency on `file:build/npm/stubs/cpu-features`, remove its root override, delete the untracked stub without committing it, and restore the exact Code - OSS 1.130 `cpu-features@0.0.10` optional transitive dependency records for `ssh2`, including `buildcheck` and `nan`. Keep `allowScripts.cpu-features` set to `false`; do not change the already-upstream-aligned `remote/` dependency configuration or run the native module build script.

Remove the native-terminal initial hint and the complete Workbench Terminal Suggest overlay rather than merely hiding the visible prose. This includes their runtime contributions, commands, keybindings, settings, context keys, completion-provider protocol and proposed extension API, state, telemetry, tests, styles, and localized resources. Preserve the native PowerShell process, PSReadLine behavior, shell integration, command detection and decorations, terminal history, arbitrary CLI execution, and all BC Runner behavior. After removal, Workbench must not intercept `Ctrl+Space` for the deleted suggestion feature.

Remove Source Control as a BeCoder product capability rather than hiding its Activity Bar icon. Remove SCM and Quick Diff views, services, actions, menus, settings, context keys, colors, protocols, stable and proposed extension API, contribution points, Git-extension bridge, shared-process local-Git channel, build resources, tests, and localized resources. Remove only SCM-owned integration from mixed consumers: keep the generic Diff and Multi Diff editors, ordinary file comparison, unsaved-file indicators, Markdown editing and Mermaid rendering, Timeline local history, Explorer, Search, Formatting Document/Selection, terminal, Authentication, Browser View, and ordinary extension infrastructure. User-installed SCM providers must not be able to recreate a Source Control product surface through `vscode.scm`, `views.scm`, SCM menu contribution points, or Quick Diff APIs.

Workspace `.vscode` is explicitly retained as a protected user project asset and BeCoder workspace capability. Continue reading `.vscode/settings.json`, `.vscode/tasks.json`, and `.vscode/extensions.json`; preserve multi-root, workspace-level, and folder-level configuration; and retain ordinary extension access to its own workspace settings. Never delete, rewrite, migrate, hide, or clean user-created `.vscode/launch.json`, `c_cpp_properties.json`, or any other `.vscode` file merely because its former consumer is absent. Existing `scm.*` settings may remain as untouched unknown settings after their schema is removed. Preserve `.git`, `.gitignore`, `.gitattributes`, and every other version-control asset. Native PowerShell may still run `git` as an ordinary user command.

System VS Code remains outside BeCoder's configuration boundary: do not read or modify `%APPDATA%\Code`, `%USERPROFILE%\.vscode\extensions`, system VS Code settings, extensions, cache, clangd configuration, or clangd cache. BeCoder profile settings, installed extensions, cache, and locale state remain under BeCoder-owned data paths.

Stage 4.6 must also rerun the complete Stage 4.5 boundary suite. AI, Chat, Agent, language-model, MCP, Debug, and GDB product paths remain absent, while the generic infrastructure accepted in Stage 4.5 remains available. Any Stage 4.5 residual that is still on a live Git/SCM runtime path may be removed as part of Stage 4.6; unrelated unreachable upstream source is not a license for another keyword-driven sweep.

Stage 4.6 validation gates:

1. `npm ci` succeeds from the restored lockfile without a local `cpu-features` stub or native build script execution, and the relevant lock entries structurally match Code - OSS 1.130.
2. Focused boundary tests prove absence of terminal hint/suggestion and SCM runtime/API/package surfaces while positively retaining PowerShell, shell integration, BC Runner, generic Diff, Markdown/Mermaid, Timeline local history, Authentication, Browser View, Tasks, workspace configuration, and extension recommendations.
3. The complete Stage 4.5 boundary suite passes without broad keyword-only assertions.
4. `npm run typecheck-client` and `npm run compile-oi-extensions` pass under their standard 120-second limits.
5. The protected Simplified-Chinese pack removes only deleted terminal-suggestion and SCM product translations, retains generic Authentication and other retained-product translations, and has updated source and packaged-content hashes.
6. An independent read-only reviewer checks dependency restoration, runtime/API closure, mixed-consumer preservation, `.vscode` protection, localization, package rules, and Stage 4.5 regressions; findings are fixed and re-reviewed.
7. `npm run gulp vscode-win32-x64-min` passes under the 300-second limit, followed by `verify-becoder-package.ps1 -IncludeCompiler $true`.
8. Stop after direct package verification and hand the package to the project owner. Runtime GUI acceptance, archive, commit, and remote backup occur only after project-owner approval.

### Workbench and Product UI

Use `C:\Users\Bc\Desktop\BeCoder\vscode-1.130.0` as the interaction and visual reference where it does not conflict with BeCoder's product boundary.

- Add a clearly visible gear-shaped Settings entry with one unambiguous command/menu/icon owner.
- Correct About and View License presentation for BeCoder while preserving required legal notices.
- Remove Ask `@vscode` from Help.
- Remove the user-facing debug workbench, debug entry points, commands, views, menus, keybindings, settings, and GDB paths after dependency tracing.
- Preserve ordinary editing, terminal, build, extension, and language-service behavior after cleanup.
- Keep the requested terminal status visuals, including the left status indicator and red cancellation mark after `Ctrl+C`.
- Remove every first-launch wizard and toolchain-extraction page. Setup installs the expanded GCC and clangd payload; ordinary startup performs only the non-destructive installed-toolchain health check.
- On a clean BeCoder profile, the first launch must show generated `.exe` files and dot-prefixed configuration files/folders in the left Explorer by default so beginning competitive programmers can see the executable produced by compilation.
- The Explorer action named `Hide Configuration and Executable Files` must hide both dot-prefixed files/folders such as `.vscode`, `.clangd`, and `.clang-format` through `**/.*`, and BeCoder-managed executable/binary artifacts such as `**/*.exe`. The paired `Show All Files` action must remove only those BeCoder-managed hide patterns and preserve unrelated user exclusions.
- BeCoder Setup must not add these hide patterns during first launch or ordinary setup. Hiding begins only after the user explicitly invokes the Explorer action, and the action state must remain consistent with the effective BeCoder-managed patterns.

Project-documentation contract:

- Historical Microsoft/Visual Studio Code product, feedback, contribution, and security-policy text is not BeCoder guidance and must not remain presented as the project's own policy.
- Until dedicated documents are written, `README.md`, `README_cn.md`, `SECURITY.md`, and `CONTRIBUTING.md` remain narrow placeholders that route development work to this handoff and `AGENTS.md`; they must not make unverified product, support, release, or security-reporting promises. Project-level Copilot, pull-request, and issue templates must likewise identify BeCoder and contain no Microsoft/Visual Studio Code support or triage routes.
- Planned documentation work must create coherent English and Simplified-Chinese BeCoder README content, a BeCoder-owned contribution guide, and a BeCoder-owned security policy. The README pair must document the accepted Setup-only distribution, product boundaries, core workflow, Open VSX/local VSIX policy, source-build/verification flow, support links, and required license/provenance references. The same documentation pass must audit inherited component documentation and non-document GitHub triage metadata separately; do not delete generic architecture guidance, legal provenance, or component-specific build knowledge by keyword.
- Source provenance, GPL-3.0-or-later project licensing, upstream MIT notices, bundled-component licenses, `ThirdPartyNotices.txt`, and corresponding-source records remain mandatory legal facts and must not be removed while clearing stale upstream product prose.

### Stage 4.7 Setup-Only Distribution, Directory-Portability, and Toolchain Closeout

Status: **In progress**. Stage 4.7 starts from archived commit `928aec1` on branch `codex/stage4.7`. The only Windows release artifact is `BeCoderSetup-x64-<version>.exe`. There is no Portable ZIP release and no first-launch extraction workflow. Setup installs one self-contained, movable BeCoder directory with already-expanded GCC and clangd. A protected export/import foundation is present in the source and package, but its BeCoder-settings entry, complete product usability, runtime acceptance, and archival belong to Stage 4.8.

Explorer visibility contract:

- A clean BeCoder profile must not add any BeCoder-managed `files.exclude` entry. Generated `.exe` files and dot-prefixed files/folders are visible until the user explicitly invokes `Hide Configuration and Executable Files`.
- The managed hide set is `**/.*`, `**/*.exe`, `**/*.bin`, `**/*.bin.dSYM`, and `**/*.dSYM`. The command must set the complete managed set, while `Show All Files` restores only values BeCoder changed and leaves unrelated user patterns untouched.
- Replace the shared toggle implementation with distinct hide and show operations. Their visibility and context state must reflect whether the complete managed set is active; a partial or user-edited set must never be mistaken for a fully owned BeCoder state.
- Persist the pre-hide values in BeCoder extension state so panel/window restart does not lose the restoration boundary. When showing files, do not overwrite a managed key that the user changed after BeCoder applied the hide state.
- Add a narrow one-time migration for historical BeCoder profiles that received the old forced executable/configuration exclusions. It may remove only the known BeCoder global defaults and must not read, delete, or rewrite workspace/folder `.vscode` settings or unrelated user exclusions.

Installed-product and runtime contract:

- Remove the old first-run configuration wizard permanently: do not restore folder selection, configuration choices, historical `becoder.setup.completed` / `becoder.setup.pending` state, a toolchain preparation page, the old workspace-selection branch, old window routing, or the old high-coupling IPC contract.
- Setup installs already-expanded, verified GCC and clangd directories. BeCoder runtime must not extract or download toolchains, consume bundled toolchain archives, maintain extraction/readiness/repair markers, or offer retry/redetection/repair commands.
- Runtime performs a non-destructive fast health check against a versioned full-tree manifest. Startup validates the manifest and checks only the critical compiler, standard-library, PCH, debugger-header, runtime DLL, and clangd entries by presence and size without hashing the large PCH or invoking a compiler; the explicit diagnostics page verifies the exact retained tree and every SHA-256 hash, then runs executable `--version` probes. A moved installation that violates the Setup ASCII/70-character root boundary is reported as damaged and directs the user back to Setup.
- When the health check fails, BeCoder reports that the installation is incomplete or damaged and offers exactly `Get BeCoder Setup` and `Open Diagnostics` in English, with equivalent Simplified-Chinese labels. It does not attempt repair or extraction.
- The installed directory remains self-contained and movable to a USB drive. Program files, toolchains, user data, user extensions, settings, history, caches, and `argv.json` stay under that BeCoder installation root. Moving the complete directory must not require reinstalling, registry repair, system PATH, or system VS Code state.
- Preserve BeCoder's fixed compiler/clangd ownership, workspace `.vscode`, and complete isolation from system VS Code data, extensions, settings, caches, registry-discovered compilers, and user PATH. Native PowerShell remains the only component that intentionally receives the user's system environment.

Setup packaging contract:

- Produce only `BeCoderSetup-x64-<version>.exe`; do not publish or advertise a Portable ZIP. Setup expands the application, audited toolchains, and private `data` root into a user-selected dedicated BeCoder directory and may launch that installed `BeCoder.exe` when installation finishes.
- Produce only a per-user Setup that requires no administrator privileges. Do not produce or advertise a System Setup.
- Setup is a pure directory installer. It creates no Start-menu or desktop shortcut, writes no registry entry of any kind, creates no uninstall entry, and leaves no installation record outside the selected directory. It does not remember a previous BeCoder directory or reuse another installation's installer state; every invocation presents an independent directory choice.
- Setup must not associate `.c`, `.cpp`, `.h`, `.hpp`, or any other file type; register BeCoder as a default application; add Explorer file, folder, background, or drive context-menu commands; modify `PATH`; register a `becoder` command, Windows App Paths entry, or URL protocol; install a service, updater service, scheduled/background task, or startup entry; or add any other system-level IDE integration.
- Setup must not read, migrate, or modify system VS Code settings, extensions, caches, or user data. It must not write configuration into a user project. BeCoder's own settings, extensions, caches, toolchains, and runtime state remain inside its self-contained installation `data` directory.
- Setup writes `.becoder-installation.json` schema version 2 at the installation root with `product: "BeCoder"` and an independent UUID `installationId`. A new empty directory receives a new ID; a complete replacement of the same authenticated directory retains its existing ID while still deleting every program, toolchain, setting, extension, history, cache, and other BeCoder-owned file. The marker contains no absolute path and moves with the installation.
- Setup replacement may delete content only after validating the ownership marker and canonical target path. A nonempty directory without a valid marker must be rejected; never infer ownership from a directory name or executable alone. Replacement is always scoped to the currently authenticated installation and must not enumerate or affect another BeCoder directory.
- Because GCC 14.1.0 fails deep PBDS header lookup from longer roots and fails to link when its own installation root contains non-ASCII characters, Setup accepts only canonical installation roots containing ASCII characters with a maximum total length of 70 characters. Spaces are supported. This restriction applies equally to interactive and silent installation and leaves the installed compiler root within the measured passing range.
- Reinstall is a complete replacement, not an in-place data-preserving upgrade. Before proceeding, warn that all program files, toolchains, settings, extensions, history, and other BeCoder-owned `data` will be permanently deleted and recommend exporting user data. Then remove and recreate only the authenticated BeCoder installation root.
- BeCoder has no uninstaller, uninstall registration, uninstall helper, or uninstall compatibility path. After closing BeCoder, deleting the complete installation directory is the complete uninstall; because all BeCoder-owned program files, toolchains, settings, extensions, history, caches, and user data live inside that directory, BeCoder leaves no product data elsewhere. Manual directory deletion cannot display a data-export reminder and the product does not promise one.
- Silent Setup replacement must refuse data deletion unless the caller also supplies the explicit `/BECODERALLOWDATALOSS=1` consent switch. This switch exists only for controlled replacement verification and automation; ordinary interactive users receive the bilingual replacement warning instead.

Installation-instance and language-startup contract:

- `becoder.displayLanguage` synchronization must wait for `IExtensionService.whenInstalledExtensionsRegistered()` before inspecting or updating the application-scoped setting contributed by protected `becoder.becoder-setup`. A missing protected Setup extension is a product-integrity error recorded in the product log and reported explicitly, never an ordinary unregistered-configuration notification.
- Remove the fixed global `win32MutexName`. The canonical installation-local `data` path remains the authority for `mainIPCHandle`, so repeated launches of one installation merge while installations with different `data` roots can run simultaneously and never forward windows to one another.
- Derive the Windows AppUserModelID from the validated directory-local `installationId`, without registry state, so simultaneously running installations remain separate taskbar identities. The user-data import mutex remains independently derived from that installation's canonical `data` path.
- Installing or reinstalling one directory must not read, close, overwrite, delete, or adopt another installation. Moving a complete installation, including its marker and `data`, to another supported path or removable-drive letter preserves its identity, settings, extensions, history, compiler, clangd, Runner, and ordinary startup behavior.

### Stage 4.8 User-Data Portability

Status: **Foundation implemented, product delivery planned for Stage 4.8**. Stage 4.7 contains protected command registrations, archive/import machinery, startup recovery, source tests, and package boundaries because safe replacement requires a coherent transaction design. The project owner could not find a usable export/import entry in the current BeCoder settings experience, so this foundation is not accepted or archived as a completed user feature. Stage 4.8 must review it again, add clear controls under BeCoder IDE Features, complete the end-to-end experience, and obtain separate runtime acceptance.

Planned user-data portability contract:

- Expose the existing protected bilingual commands `Export BeCoder User Data` and `Import BeCoder User Data` as clear controls under BeCoder IDE Features. The portable backup suffix is `.becoder-backup`.
- Export includes user settings, keybindings, snippets, user-installed extensions, recent-project metadata, workspace state, local file history, and only the sanitized `zh-cn` or `en` display-locale value from `data\argv.json`. It excludes every other `argv.json` field, program files, toolchains, protected built-in extensions, caches, logs, credentials/tokens/secret storage, unsaved working-copy backups, and user source projects.
- A backup destination inside the current BeCoder installation root is rejected because Setup replacement or manual directory deletion removes that root. Export writes to a staged temporary file and atomically publishes the completed backup with a versioned manifest and per-entry integrity hashes.
- Import first extracts into a narrowly named directory under authenticated BeCoder `data`, validates format version, path safety, integrity hashes, size/count limits, extension identities, and the complete archive, and then closes BeCoder without copying live databases. The detached helper revalidates the extracted payload after every Workbench and extension-host process exits, snapshots current data, and records every target/staging move in a size-bounded, atomically replaced `data\.becoder-import-transaction.json` journal before applying it. Normal import and startup recovery are serialized by one installation-specific Windows mutex derived from the canonical `data` root. The helper that actually performs each operation owns that mutex for the complete journal check, swap, commit, rollback, cleanup, and relaunch boundary; a parent main-process crash therefore cannot release an active recovery lock. A main-process startup gate runs the packaged recovery helper in a sanitized Electron-as-Node environment and waits for it before any Workbench service or database opens: an uncommitted journal restores the old data, while a committed journal retains the new data and finishes removal of previous/staging state. Recovery failure blocks startup instead of opening mixed databases. The helper rejects cpptools and any extension that conflicts with protected Runner, clangd, One Monokai, CodeSnap, C/C++ grammar, language pack, GCC diagnostics, Setup, or other BeCoder-owned identities.
- Display-language import uses structured JSONC editing to atomically replace only `locale` in `data\argv.json`; all unrelated fields and comments remain intact. Export/import plaintext staging never uses the system temporary directory, and stale authenticated staging is removed conservatively. Import never writes user projects or system VS Code directories and never restores credentials, secrets, process state, caches, logs, or unsaved buffers.
- Setup replacement and manual directory deletion do not invoke export automatically and do not preserve data implicitly. The user controls backup creation and restoration explicitly through the Stage 4.8 feature.
- Stage 4.7 Setup may warn users to export before destructive replacement, but that warning does not make the current commands discoverable or mark Stage 4.8 as delivered. Stage 4.8 must provide the settings controls and runtime acceptance before the warning can point to a completed user workflow.

Toolchain slimming and installation payload contract:

- Stage 4.9 is merged into Stage 4.7. Continue from BeCoder's audited UCRT64 GCC 14.1.0 and clangd 22.1.6 assets; do not adopt ShortestPath's GCC 16.1.0, AppData toolchain model, size-only verification, or broader package set.
- Build the installed toolchain payload from an exact allowlisted manifest and preserve C17, C++20, `bits/stdc++.h`, PBDS, ranges, filesystem, threads, UTF-8, `stdc++.h.gch`, `debugger.h`, Runner, GCC diagnostics, and every retained clangd feature. PCH remains required unless measurements prove a replacement with equivalent first-compile behavior.
- Candidate removals require dependency and execution evidence. Audit Python payloads, plugin-development files, documentation, unused binutils/frontends, duplicate drivers, and unused libraries; do not remove by filename intuition or broad pattern matching.
- Preserve source package identities, recipes, patches, license directories, checksums, machine-readable component inventory, and a human-readable third-party license bundle. Corresponding-source availability and reproducible payload generation are release gates.
- Record compressed source-archive size, staged installed-toolchain size, final installed size, and Setup size before and after each accepted reduction. The approximate installed-size target is 900 MiB, but correctness and offline independence take priority over the target.
- Historical measurement only: the hydrated GCC source archive was 149.22 MiB; the original expanded compiler was 575.10 MiB across 4,347 files; the allowlisted compiler was 386.08 MiB across 3,646 files, saving 189.03 MiB; and expanded clangd was 92.45 MiB. A pre-closeout candidate measured 955.76 MiB installed and 177.78 MiB for Setup with SHA-256 `c227177e63508bca98e9360fc6f66bc702c39b33d0125095b782991afb67e925`. That candidate predates the final no-uninstaller, zero-registry, multi-installation, language-startup, Runner, and documentation closeout and is not a current release candidate. Recompute all final sizes and hashes from the next verified build.

Branding and legal contract:

- Correct About, View License, Report Issue, and other user-facing BeCoder repository links to the current `Bc408/BeCoder` project while preserving GPL-3.0-or-later and all bundled third-party notices.
- Keep the already accepted Settings gear, Help cleanup, terminal status visuals, AI/Debug/GDB/SCM removal, and bilingual behavior. Stage 4.7 verifies these retained results but does not reimplement or broaden them.
- Remove stale product-specific branding only from live user-visible paths. Do not use broad `VS Code`, old-project-name, or repository-string deletion against generic source comments, extension API terminology, tests, or unreachable upstream infrastructure.

Stage 4.7 validation gates:

1. Focused tests cover clean-profile visibility, complete/partial managed patterns, hide/show restoration, user edits while hidden, unrelated exclusions, legacy migration, multi-root/workspace preservation, and command/context state.
2. Boundary tests prove runtime toolchain extraction/download code, archive consumption, first-launch pages, preparation/readiness/repair markers, retry/repair/redetection commands, historical setup state, old BrowserWindow/preload/IPC ownership, and Portable release tasks remain absent.
3. Runtime health tests cover a complete install, every required component class, corrupt/missing manifest data, moved installation roots, bilingual failure text, and exactly the two allowed actions without attempting repair.
4. The Stage 4.8 foundation retained in the Stage 4.7 package has source-safety tests for the complete allowlist and denylist, archive traversal, links/reparse points, duplicate/case-colliding paths, malformed manifests, hash failure, oversized archives, destination-inside-install rejection, cpptools/core-extension conflicts, atomic publication/replacement, interruption, rollback, and source-project/system-VS-Code isolation. These tests do not constitute Stage 4.8 UI/runtime acceptance.
5. Setup verification installs into two clean independent directories, confirms distinct valid `installationId` values, and proves that application files plus already-expanded toolchains match the staged manifest. Setup replacement retains only the same directory's ID while completely replacing its data, refuses invalid/missing ownership markers and nonempty foreign directories, remains isolated from the other installation, and preserves external projects.
6. Negative Setup checks prove there are no desktop or Start-menu shortcuts, uninstall files or helpers, previous-directory memory, file associations, default-application registrations, Explorer context menus, PATH edits, App Paths or command registration, URL protocol, services, background updater/tasks, startup entry, project writes, system VS Code access, or administrator/System Setup path. Static installer checks and before/after HKCU/HKLM snapshots must prove that Setup writes no registry entry. Separate project-owner runtime acceptance must verify that ordinary BeCoder launch and use also leave the monitored registry state unchanged; Setup-only automation must not be described as runtime proof.
7. Toolchain tests compile and run representative C17/C++20 programs covering PCH, `debugger.h`, `bits/stdc++.h`, PBDS, ranges, filesystem, threads, UTF-8, diagnostics, and retained clangd operations from a supported ASCII installation root containing spaces, while source paths also cover non-ASCII characters. The Setup must work offline on a machine without GCC, clangd, PowerShell decompression tools, 7-Zip, or WinRAR.
8. Product and package checks verify current repository/license/issue/publisher targets, coherent English and Simplified-Chinese labels, legal inventory, and retention of required GPL and third-party notices.
9. Rerun the complete Stage 4.5 and Stage 4.6 boundary suite so generic Authentication, Browser View, Markdown/Mermaid, terminal, Tasks, `.vscode`, and user Git assets remain available while removed AI/Debug/GDB/SCM/terminal-suggest paths stay absent.
10. `npm run valid-layers-check`, `npm run typecheck-client`, `npm run compile-oi-extensions`, focused extension/workbench tests, build-script tests, `git diff --check`, and independent read-only review pass before packaging.
11. Build the staged Windows application and Setup under the documented timeouts, verify the installed payload and installer boundaries, and emit only `BeCoderSetup-x64-<version>.exe` as the release candidate. Project-owner acceptance must run two installations concurrently, prove same-install launch merging and cross-install isolation, and move one complete directory to a different supported root or drive letter. Closing BeCoder and deleting that directory is the only uninstall workflow. A transient unpacked staging directory is a build implementation detail, not a published Portable product.
12. Stop after direct Setup verification and hand the Setup artifact to the project owner. GUI/runtime/USB-drive acceptance, archive, commit, and remote backup occur only after project-owner approval.

Implementation checkpoint (2026-08-09):

- Explorer visibility now has a pure ownership model and focused tests covering clean profiles, full and partial managed sets, exact restoration, user edits while hidden, effective workspace and per-folder multi-root overrides, manual exclusions, re-hide behavior, and the narrow full-fingerprint legacy migration. Operations are serialized within an extension host, configuration is committed before ownership state, every workspace root must be effectively hidden before the Show action is presented, and workspace/folder settings remain read-only. The accepted editor and Runner defaults moved to Setup `configurationDefaults`; `files.exclude` is deliberately absent.
- The first-run HTML/preload, dedicated BrowserWindow/IPC routes, pending/completed settings, rerun command, workspace-selection startup branch, archive extraction, readiness/repair markers, and retry/redetection commands are removed. The Windows build now expands both audited archives, constructs the GCC payload from an explicit allowlist, writes a complete retained-tree hash manifest, and places the expanded toolchains directly under the staged package `data` directory before Inno Setup runs.
- The retained GCC matrix passes C17, C++20, `bits/stdc++.h`, PBDS, ranges, filesystem, threads, UTF-8, `debugger.h`, warning/error output, real PCH use, and Unicode source paths through an ASCII private output path. clangd 22.1.6 starts from the staged payload. Empirical path probes pass a compiler root of length 101 and fail deep PBDS lookup around length 114; a Chinese compiler root fails GCC's own link-library lookup, which establishes the Setup path boundary above. Runner silently removes only the current source's old target as normal overwrite preparation, cancels without spawning GCC if that target is in use, compiles under the private ASCII session root, and publishes through a unique sibling staging file beside a Unicode source. Compile or publication failure removes the target and all request-owned executable artifacts without restoring stale output and reports the matching yellow cleanup result. After successful publication, the asynchronous executor never removes the workspace target. Normal completion, Runtime Error, and post-publication launch failure hand the target to one terminal-owned synchronous transaction that confirms the BC terminal is still open, deletes and verifies the target, and emits the corresponding result plus `Executable Program Removed` without an intervening `await`; cancellation, terminal closure, shutdown, or earlier private-cleanup failure preserve the published target and emit no false removal text.
- The Stage 4.8 foundation currently uses a versioned `.becoder-backup` ZIP with per-file hashes, file/count limits, symlink and Windows path rejection, protected/blacklisted extension identity checks, detached post-shutdown snapshot and SQLite mutation, persisted move-phase journaling, startup-before-services recovery, rollback preservation, atomic result publication, and sanitized display-locale transfer. Oversized or linked journals are rejected before parsing, invalid helper configuration still relaunches the trusted BeCoder executable and writes diagnostics only under the authenticated data root, and committed cleanup remains recoverable on the next launch. Plaintext staging stays under authenticated `data`. It exports only the documented settings, keybindings, snippets, user extensions, recent-project state, generic Workbench workspace state, local history, and locale; it neither recognizes historical AI state by keyword nor restores credentials, caches, logs, source projects, or unsaved backups. This is implementation evidence only; user-facing completion and acceptance remain Stage 4.8 work.
- The targeted Stage 4.7 closeout converts Inno into a pure directory installer with no shortcuts, uninstaller, uninstall helper, fixed installer identity, previous-directory memory, or registry writes. Setup retains ownership-marker checks, complete same-directory replacement, foreign-directory refusal, the ASCII/length boundary, and explicit consent for silent replacement; the marker is schema version 2 with a directory-local installation UUID. Its Simplified-Chinese resource remains synchronized to the MIT-licensed upstream 6.4.0+ message set required by Inno 6.4.1.
- Product license, issue, repository, and bugs metadata now target `Bc408/BeCoder`. Current checks pass: core client typecheck, OI extension compilation, `valid-layers-check`, Setup tests (33/33), Runner tests (52/52), build and Electron-main TypeScript checking, the complete Stage 4.5/4.6/4.7 boundary suite (18/18), all build-script tests (224/224), workflow YAML parsing, PowerShell parsing, direct Inno compilation, `precommit`, and `git diff --check`. The package verifier requires `node_modules.asar`, the unpacked native SQLite and Windows-mutex binaries, the startup recovery bundle boundary, and a real Electron-as-Node probe that loads the packaged helper and `jsonc-parser`, creates and releases a native mutex, opens an in-memory SQLite database, and executes a query. An earlier focused review passed the import-helper mutex boundary, but the latest Stage 4.7 closeout review still required the Stage 4.8 documentation boundary and broader zero-registry verification to be corrected. Those document changes and verifier edits require fresh validation and final independent re-review before packaging.
- The repository-wide `npm run eslint` command still fails on the inherited fork baseline, dominated by bundled CodeSnap/clangd sources and generated Mermaid JavaScript without Code - OSS headers plus pre-existing extension-style findings. Stage 4.7 does not rewrite those third-party snapshots. The only Stage 4.7 Runner warning surfaced by that run (`prefer-const` in `runnerProcess.ts`) is fixed, and the directly changed Runner source passes targeted ESLint. Do not describe the full-repository ESLint baseline as passing.
- `npm run valid-layers-check` passes. Removing the first-run IPC closed the archived direct `ipcMain` dependency in `app.ts`; shared checker configuration now applies the established Stage 4.5 product-unreachable AI/Agent/MCP/Chat source boundary consistently across browser, worker, Node, and Electron environments without restoring any removed product service or dependency.
- An earlier transient unpacked Windows build completed in approximately 68 seconds and produced `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`; it was useful only as intermediate build evidence. Its package verification predates the final Setup-only toolchain manifest and import-transaction changes and is not a release candidate. The current verifier requires the installed manifest, health-check/diagnostics modules, deferred import helper, complete Explorer ownership implementation, and absence of every runtime extraction/readiness boundary.
- The 2026-08-09 application and Setup builds predate the final no-uninstaller, zero-registry, multi-installation, language-startup, and Runner closeout and are no longer acceptance candidates. A new build is permitted only after the revised source checks and independent review pass.
- GUI/runtime acceptance remains intentionally pending and belongs to the project owner. Do not archive, commit, or push Stage 4.7 until the project owner accepts the verified Setup artifact.

## 5. Important Source Locations

Setup and toolchain:

- `extensions/becoder.setup/src/extension.ts`
- `extensions/becoder.setup/src/toolchainDiagnostics.ts`
- `extensions/becoder.setup/src/toolchain.ts`
- `extensions/becoder.setup/src/toolchainManifest.ts`
- `extensions/becoder.setup/src/userDataPortability.ts`
- `extensions/becoder.setup/src/userDataImportHelper.ts`
- `extensions/becoder.setup/src/userDataPayload.ts`
- `build/lib/becoderToolchain.ts`
- `build/win32/becoder.iss`
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

- `extensions/danielpinto8zz6.c-cpp-compile-run/src/bcTerminal.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/compile-run-manager.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/compiler.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerProcess.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerPresentation.ts`
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/terminalVisuals.ts`

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
- Built-in theme: `extensions/becoder.one-monokai`
- ShortestPath reference: `C:\Users\Bc\Desktop\BeCoder\shortestpath-ide-Release-v0.2.8`

Protected built-in extensions:

- `extensions/aadityanarayan.code-snap`
- `src/vs/workbench/services/extensions/common/extensionsUtil.ts`
- `src/vs/workbench/services/extensions/test/common/extensionsUtil.test.ts`

Build and package verification:

- `build/azure-pipelines/win32/verify-becoder-package.ps1`
- `build/azure-pipelines/win32/verify-becoder-setup.ps1`
- `build/win32/becoder.iss`
- `resources/oi-defaults/toolchains/`

Project documentation:

- `README.md`
- `README_cn.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `AGENTS.md`
- `BECODER_HANDOFF.md`
- `.github/copilot-instructions.md`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/`

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

After a successful staged Windows application build, direct package verification may run with `-IncludeCompiler $true`, followed by the Setup build and Setup verifier. Build success proves compilation and packaging only. It does not prove GUI startup, visual behavior, Runner interaction, import/restart behavior, USB movement, or runtime isolation.

The project owner performs final GUI and Setup acceptance. Unless explicitly requested, the coding agent must stop after source validation, staged package verification, Setup build, and direct Setup verification, then report the Setup artifact path and exact checks completed.

The consolidated Stage 4 acceptance matrix includes:

- clean-profile startup directly into BeCoder defaults without any configuration or toolchain-preparation wizard;
- an already-expanded Setup-installed toolchain, fast non-destructive startup health checks, and exactly `Get BeCoder Setup` plus `Open Diagnostics` when the installation is incomplete, damaged, or moved outside the supported path boundary;
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
- absence of AI, debug/GDB, ShortestPath network services, and removed non-core bundled extensions, while built-in Mermaid Markdown and Notebook rendering remains available without Chat integration;
- BeCoder branding, Help entries, Settings gear, and terminal cancellation visuals;
- comparison with `portable_stage2_4_verified`, ShortestPath visual behavior, and the VS Code 1.130 reference where applicable.

## 8. Stage 4 Work Register

| Feature area | Status | Current handoff point |
| --- | --- | --- |
| Stage 4 specification consolidation | Archived | The authoritative Stage 4 requirements and ownership boundaries are consolidated, committed, and accepted by the project owner. |
| Better C++ Syntax single grammar | Archived | The pinned `071dd6e` snapshot is token-scope equivalent to ShortestPath's effective 1.27.1 grammar; the package contains one accepted `source.cpp` owner. |
| BeCoder One Monokai | Archived | The protected MIT-licensed `becoder.one-monokai` system extension is the accepted first-launch default. |
| CodeSnap core retention | Archived | Bundled `adpyke.codesnap` remains a BeCoder-distributed core capability and is excluded from Open VSX migration or non-core cleanup. Stage 4.4 implements and validates its same-ID replacement protection. |
| clangd capability reduction | Archived | Stage 4.1 exposes only completion, signature help, hover, definition, references, rename, and document/range formatting; source, package, and project-owner acceptance passed. |
| Google formatting | Archived | Stage 4.1 uses clangd's embedded ClangFormat with Google fallback, accepts only a physical workspace `.clang-format` override, and ships no separate `clang-format.exe`; source, package, and project-owner acceptance passed. |
| GCC editor error diagnostics | Archived | Stage 4.2 source, focused tests, raw bundled-GCC matrix, standard Windows build, direct package verification, package/source hash comparison, independent review, and project-owner portable GUI acceptance passed. |
| Runner and BC panel | In progress | The Stage 4.3 interaction baseline remains accepted. Stage 4.7 is closing only the executable-lifecycle edge cases so terminal closure/cancellation cannot race a silent target deletion and post-publication launch failure follows the same truthful cleanup protocol. |
| Run performance | Archived | Stage 4.3 removes terminal startup/result polling from the hot path, records phase metrics, and passed project-owner portable acceptance. |
| Explorer `input` ordering | Archived | Stage 4.3 source, Electron tests, and project-owner acceptance prove that only an exact ordinary file named `input` is pinned above every sibling under all Explorer sort modes. |
| Stage 4.3 visual closeout | Archived | The accepted visual architecture, BC detail refinements, and GCC namespace-isolation correction passed focused validation, final read-only review, replacement build, direct package verification, and project-owner acceptance. |
| Explorer visibility toggle | In progress | Stage 4.7 removes forced first-launch exclusions and implements explicit, reversible ownership of the complete dotfile/executable hide set without changing unrelated user exclusions. |
| Stage 4.4 Open VSX and extension governance | Archived | Source uses only Open VSX, enforces the cpptools blacklist and eight-ID core protection across install/enablement/dedup paths, and excludes the three JS Debug downloads while recording bundled licenses plus UCRT64 provenance and corresponding source. The package accepted at Stage 4.4 also excluded Mermaid; Stage 4.5 supersedes only that Mermaid product decision and restores it as a built-in Markdown component without Chat integration. |
| Stage 4.4.1 protected Chinese and bilingual UI | Archived | The pinned 1.130 Simplified-Chinese VSIX is the eighth protected core component, fresh profiles default to Chinese, English uses source messages, `BeCoder IDE Features` owns the two-language setting, changes persist before optional restart, protected gallery results are hidden, and BeCoder-owned settings/toolchain surfaces are bilingual. Focused boundary tests 9/9, full build-script tests 239/239, client typecheck, OI extension compilation, JSON/PowerShell parsing, `git diff --check`, independent review, the replacement Windows build, direct package verification, and project-owner runtime acceptance pass. |
| AI/debug/GDB removal | Archived | Stage 4.5 removes the AI/Chat/Agent/language-model/MCP and Debug/GDB product dependency graphs while retaining generic Authentication, Browser View, HTML/Markdown conversion, Quick Access, terminal, testing, Images Preview, Mermaid, and other ordinary Workbench infrastructure. Source checks, independent review, the Windows portable build, direct package verification, and project-owner portable acceptance passed on 2026-08-09. |
| Stage 4.6 dependency, terminal-suggestion, and SCM cleanup | Archived | Restored the Code - OSS 1.130 optional `cpu-features` dependency model, removed the ineffective Workbench terminal hint/suggestion stack, and removed Source Control across runtime, API, localization, build, and package boundaries while preserving `.vscode`, user Git assets, native PowerShell Git commands, and ordinary Workbench infrastructure. Source checks, repeated independent review, the Windows portable build, direct package verification, and project-owner portable acceptance passed on 2026-08-09. Its historical `app.ts` layering finding was subsequently resolved by Stage 4.7 and `valid-layers-check` now passes. |
| Workbench/branding alignment | In progress | Stage 4.7 removes the old configuration wizard, all runtime extraction/preparation routes, and high-coupling first-run architecture; corrects live BeCoder repository/legal links; and retains the accepted Settings/Help/terminal cleanup. |
| Setup-only Windows distribution | In progress | Stage 4.7 builds one Setup containing the complete self-contained application and expanded toolchains. The closeout removes every shortcut, uninstaller and registry write, gives each directory a directory-local UUID identity, allows independent simultaneous installations, and adds no file associations, context menus, PATH/App Paths/commands, URL protocols, services, background tasks, startup entries, system VS Code access, or project configuration. |
| Stage 4.8 user-data export/import | Foundation implemented; product delivery planned | Protected commands, `.becoder-backup` transaction machinery, startup recovery, source tests, and package boundaries exist, but the project owner could not find a usable settings entry. Stage 4.8 must review the implementation, expose clear bilingual controls under BeCoder IDE Features, verify the complete settings/extensions/history boundary, and obtain separate runtime acceptance. |
| Toolchain slimming and release | In progress | GCC is allowlist-staged at 386.08 MiB instead of 575.10 MiB and the full compiler/clangd matrix passes. Final installed-product and Setup size, package verification, and project-owner acceptance remain pending. |
| BeCoder project documentation | Planned | Replace the temporary README, security-policy, and contribution-guide placeholders with BeCoder-owned English/Simplified-Chinese product documentation. Minimal BeCoder Copilot/PR/Issue templates are already present. Preserve legal provenance while removing stale Microsoft/Visual Studio Code product guidance and obsolete Portable/Marketplace/build instructions; separately audit inherited component docs and GitHub triage metadata without keyword-driven deletion. |

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
- Source validation: current source and package policy retain the bundled extension; archived Stage 4.4 Open VSX and local-VSIX validation proves that a user/workspace copy cannot replace the protected built-in identity.
- Package/build validation: prior accepted portable packages include the bundled CodeSnap extension.
- User acceptance: explicitly approved for archive by the project owner on 2026-08-07.
- Remaining risks or follow-up: implement and test same-ID protection before Open VSX installation is enabled; do not classify that work as part of this archived retention decision.

### Stage 4.1 clangd intelligence and Google formatting

- Requirement: reduce bundled clangd to the approved code-intelligence and formatting closed set, remove clangd diagnostics and visual authority, isolate it from project/system configuration, and provide Google-style document and selection formatting without a separate formatter executable.
- User-visible result at the archived Stage 4.1 checkpoint: BeCoder retained completion, signature help, hover, definition, references, rename, and explicit formatting; clangd no longer contributed diagnostics, semantic recoloring, inlay hints, inactive regions, code actions, indexing UI, or configuration surfaces. Stage 4.3 later superseded only the no-semantic-recoloring part by enabling one bounded standard clangd semantic refinement. Workspace `.clangd` files remain untouched and ignored, while an explicit workspace-contained `.clang-format` may override the Google fallback.
- Source ownership: `extensions/llvm-vs-code-extensions.vscode-clangd`, `extensions/becoder.setup`, the Electron-main legacy migration, build boundary tests, package verification, and first-run documentation.
- Commit/PR: the containing Stage 4.1 backup commit, pushed directly to `origin/stage4.1`; no PR was requested.
- Source validation: clangd `check-ts` and `test-compile`, 234 build-script tests, lockfile orphan validation, client typecheck, OI extension compilation, a raw bundled-clangd C++20 LSP probe, and three independent read-only review rounds passed. The extension-host tests were compiled but not executed.
- Package/build validation: `gulp vscode-win32-x64-min` and `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`.
- User acceptance: passed on 2026-08-07; the project owner reported that the result perfectly met the Stage 4.1 target.
- Remaining risks or follow-up: GCC diagnostics, Runner/BC panel work, Run performance, Explorer `input` ordering, extension/workbench cleanup, and toolchain slimming remain separate Stage 4 work. No agent-run GUI or extension-host test execution is claimed.

### Stage 4 C/C++ visual system

- Historical requirement at the Stage 4 visual checkpoint: make a single Better C++ Syntax TextMate grammar and BeCoder One Monokai the complete C/C++ coloring authority, with no delayed clangd recolor. Stage 4.3 superseded only the final no-recolor rule.
- User-visible result retained today: clean profiles use BeCoder One Monokai, TextMate produces an immediate complete first paint, and theme switching persists. Stage 4.3 adds one bounded standard clangd semantic refinement while custom token caches, inlay hints, and inactive-region decorations remain absent.
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
- Remaining risks or follow-up: the GCC namespace-isolation path deliberately invalidates the bundled C++ PCH and measured approximately 1.5 seconds in the focused probe. The Explorer visibility toggle is newly planned: first launch shows `.exe` and dot-prefixed items, while the explicit hide action must hide both groups. Open VSX governance and license remediation are completed and archived by Stage 4.4; AI/debug removal, broader Workbench alignment, and toolchain slimming remain separate Stage 4 work.

### Stage 4.4 Open VSX and extension governance archived checkpoint

- Requirement at the archived Stage 4.4 checkpoint: use the public Eclipse Open VSX Registry as BeCoder's only configured online extension registry; retain local VSIX import; block cpptools; prevent normal user, workspace, gallery, resource, or profile-copy replacement of the eight protected core IDs; remove Mermaid and the three downloaded JS Debug extensions from that checkpoint's OI package; and close bundled-component and UCRT64 redistribution records without deleting user assets or relying on Microsoft Marketplace. Stage 4.5 supersedes the archived Mermaid exclusion and keeps the three JS Debug removals unchanged.
- User-visible result: the normal Code - OSS Extensions workbench targets Open VSX for search, browse, install, update, and uninstall. Local VSIX remains available for extensions absent from Open VSX. `ms-vscode.cpptools` and its extension pack remain unavailable, while Runner, Setup, GCC Diagnostics, One Monokai, clangd, CodeSnap, and `vscode.cpp` retain their built-in identities. Extension-development overrides remain intentionally available for development.
- Source ownership: `product.json`; extension gallery, allowed-extension, installation, enablement, and dedup services under `src/vs/`; `build/hygiene.ts`; `build/lib/extensions.ts`; `build/azure-pipelines/win32/verify-becoder-package.ps1`; `ThirdPartyNotices.txt`; bundled extension licenses; and `resources/oi-defaults/BUNDLED-COMPONENTS.json` plus the UCRT64 package, license, and corresponding-source inventories.
- Commit/PR: included in the containing Stage 4.4.1 backup commit pushed directly to `origin/stage4.4.1`; no PR or release workflow was requested. The local `build/npm/stubs/cpu-features/` content observed at that checkpoint was subsequently removed in Stage 4.6 and is not current worktree content or technical debt.
- Source validation: the focused OI boundary suite passes 8/8 and the full build-script suite passes 238/238. JSON parsing, PowerShell parsing, `git diff --check`, direct lint of the new profile-copy test, Open VSX extension-query/latest/control endpoint probes, 38-package PKGBUILD hashes, 38-package license mappings, and all 36 normalized recipe-directory hashes pass. Git attributes explicitly fix 289 recipe text files to LF and the sole `.tar.xz` to binary; all 290 current files match their canonical Git-filtered bytes. The final post-build independent read-only review confirms that the narrow recipe-dotfile copy, extension-governance chain, license/provenance records, and package-verifier boundary have no remaining P1/P2 issue.
- Package/build validation: passed on 2026-08-08. `npm run typecheck-client`, `npm run compile-oi-extensions`, and `npm run gulp vscode-win32-x64-min` completed in order; the replacement Windows portable build completed in approximately 140 seconds. `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. An independent package-content cross-check found exactly 290 source and 290 packaged recipe files, including all six recipe `.gitignore` files, with identical relative paths and SHA-256 hashes; the obsolete packaged `.clangd` and duplicate portable-data toolchain placeholder are absent, and the packaged notice files match their source hashes.
- User acceptance: passed on 2026-08-08. The project owner confirmed that Open VSX search, browse, install, update, and uninstall; local VSIX installation including CPH; protected and blacklisted extension behavior; and the portable package meet the required experience. No agent-run GUI acceptance is claimed.
- Remaining risks or follow-up: the new native profile-copy behavior test is authored and typechecked but has not yet run from generated unit-test output. Future additions of new recipe file types must add an explicit `.gitattributes` rule before updating `filesSha256`.

### Stage 4.4.1 protected Simplified Chinese and bilingual product checkpoint

- Requirement: vendor the project-owner-supplied 1.130 Simplified-Chinese VSIX as a protected core component; default fresh BeCoder profiles to Chinese; use Code - OSS source messages for English; expose an easy two-language selector under `BeCoder IDE Features`; keep locale state entirely inside BeCoder data; hide the protected pack from online gallery results; and keep BeCoder-owned product surfaces coherent in both languages.
- User-visible result: `becoder.displayLanguage` offers only `简体中文` and `English` as the first BeCoder IDE setting. The BeCoder settings command opens that page. A selection is persisted to BeCoder's `argv.json` before the user chooses `Restart` or `Later`, and rapid changes retain only the latest pending language. Setup/toolchain pages and extension command/settings metadata have Chinese and English resources, while the accepted BC terminal protocol remains unchanged.
- Source ownership: `extensions/MS-CEINTL.vscode-language-pack-zh-hans`; `extensions/becoder.setup`; Runner and GCC Diagnostics package NLS files; `src/main.ts`; `src/vs/base/node/nls.ts`; the BeCoder display-language workbench contribution; localization services; protected extension/gallery policy; build boundary tests; package verification; bundled-component inventory; and third-party notices.
- Commit/PR: the containing Stage 4.4.1 backup commit is pushed directly to `origin/stage4.4.1`; no PR or release workflow was requested.
- Source validation: focused OI boundary tests pass 9/9 and full build-script tests pass 239/239. `npm run precommit`, `npm run typecheck-client`, `npm run compile-oi-extensions`, manifest/resource JSON parsing, package-verifier PowerShell parsing, Git attribute checks, and the complete staged-diff check pass. The precommit closeout preserves exact third-party snapshot bytes, validates only the approved Open VSX endpoints, and makes no user-visible behavior change. Independent read-only review found and then verified closure of protected-resource access, filtered-gallery pagination, superseded restart, retry-after-cancellation, and language-pack byte-boundary issues; the final review reports no remaining P1/P2. The approved VSIX archive hash, its 101-file source-tree hash, and the deterministic Code OSS JSON-minified package-tree hash are pinned separately. The display-language and gallery-pager workbench unit tests are authored and typechecked but are not yet executed from generated unit-test output.
- Package/build validation: passed on 2026-08-08. The final replacement `npm run gulp vscode-win32-x64-min` build completed in approximately 119 seconds, then `verify-becoder-package.ps1 -IncludeCompiler $true` passed for `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. The verifier recomputed the packaged language pack's 101-file tree, core protection set, bundled licenses, component inventory, and compiler/toolchain hashes.
- User acceptance: passed on 2026-08-08. The project owner confirmed satisfaction after verifying clean-profile Chinese startup, Chinese-to-English and English-to-Chinese switching with both immediate restart and `Later`, persistence across restart, the visible settings entry, bilingual BeCoder surfaces, protected-pack invisibility, and complete isolation from system VS Code settings. No agent-run GUI acceptance is claimed.
- Remaining risks or follow-up: the pinned language pack is compatible with the current 1.130 baseline; future Code - OSS baseline upgrades must update and re-audit the bundled pack as a product component rather than accepting Open VSX replacement or automatic updates. The broader Stage 4.4 Marketplace and local-VSIX acceptance matrix is archived by the project owner's separate acceptance recorded above.

### Stage 4.6 terminal suggestion, Source Control, and dependency cleanup

- Requirement: restore the Code - OSS 1.130 optional `cpu-features` dependency model without a BeCoder-owned stub; remove the ineffective native-terminal initial hint and complete Workbench Terminal Suggest stack; remove Source Control and Quick Diff as BeCoder product capabilities across runtime, extension API, localization, build, and package boundaries; preserve native PowerShell, BC Runner, generic Diff/Multi Diff, Markdown/Mermaid, Timeline local history, Tasks, Authentication, Browser View, workspace `.vscode`, user Git assets, and ordinary Workbench infrastructure; and rerun the complete Stage 4.5 boundary suite.
- User-visible result: native PowerShell opens without the ineffective suggestion hint or `Ctrl+Space` suggestion overlay, while retaining normal PowerShell, PSReadLine, shell integration, command decorations, history, and arbitrary CLI behavior. Source Control no longer appears through the Activity Bar, commands, menus, settings, views, Quick Diff, built-in Git bridge, or extension contribution APIs. User projects keep `.vscode`, `.git`, `.gitignore`, `.gitattributes`, and native-terminal `git` behavior unchanged.
- Source ownership: root `package.json` and `package-lock.json`; terminal hint/suggest contributions under `src/vs/workbench/contrib/terminalContrib`; SCM, Quick Diff, Git bridge, shared-process Git, extension-host protocols, stable/proposed API, mixed-consumer cleanup, build entry points, integration scripts, protected Simplified-Chinese resources, package verification, bundled-component inventory, and `build/lib/test/oiExtensionBoundary.test.ts`.
- Commit/PR: the containing Stage 4.6 backup commit is pushed directly to `origin/stage4.6`; no PR or release workflow was requested.
- Source validation: `npm ci`, client and build-script type checking, bundled OI extension compilation, the Simplified-Chinese boundary verifier, the focused Stage 4.6 test, the complete 17-case OI boundary suite, all 223 build-script tests, dependency and package-boundary probes, `git diff --check`, and repeated independent read-only review passed on 2026-08-09. The final review found no remaining P1/P2 issue in the accepted Stage 4.6 scope.
- Package/build validation: passed on 2026-08-09. The replacement `npm run gulp vscode-win32-x64-min` build completed under the required timeout, followed by successful `verify-becoder-package.ps1 -IncludeCompiler $true` verification of `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`. The package retained the bundled compiler, protected language pack, Markdown/Mermaid, Authentication, Browser View, native terminal, and ordinary workspace support while excluding terminal suggestion and SCM product resources.
- User acceptance: passed on 2026-08-09. The project owner completed portable GUI/runtime acceptance, confirmed satisfaction with the removed terminal hint/suggestion and Source Control surfaces plus the retained ordinary functionality, and approved Stage 4.6 for archive. No agent-run GUI acceptance is claimed.
- Remaining risks or follow-up at archive time: repository-wide `valid-layers-check` reported a pre-existing direct Electron `ipcMain` dependency in `src/vs/code/electron-main/app.ts`. Stage 4.7 subsequently removed the obsolete first-run IPC owner, and `valid-layers-check` now passes. No open layering debt remains from this finding.

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
- Do not clean caches, dependencies, staged build output, Setup artifacts, or user data during a normal build unless explicitly requested.
- Do not modify the stable reference package outside the repository.
- Do not change the user's Windows PATH or other environment variables.
- Do not stage unrelated or pre-existing working-tree changes.
- Ask before creating backup commits, pushing, opening a pull request, or changing release assets.
- Keep changes narrow and close to Code - OSS architecture.
- Add focused regression tests in proportion to each feature's risk.
- For difficult implementation, follow the independent read-only review loop in `AGENTS.md`.
- Update the Stage 4 work register during implementation and archive each feature immediately after it satisfies its required validation and acceptance boundary.
