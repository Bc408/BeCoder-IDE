# BeCoder Project Handoff

This file is the working handoff for the next BeCoder development session. It records the accepted product boundary, the current source baseline, the important implementation locations, the remaining work, and the validation rules. Do not treat a successful source build as a substitute for portable runtime verification.

## 1. Current Baseline

- Repository root: `C:\Users\Bc\Desktop\BeCoder\BeCoder_new`
- GitHub repository: `https://github.com/Bc408/BeCoder.git`
- Canonical branch: `main`
- Current main commit: `c028603` (`Merge pull request #3 from Bc408/codex/stage2-4-clangd-fix`)
- The local `main` branch is synchronized with `origin/main`.
- Stage 2.4 source fixes were merged through GitHub PR #3.
- Stable runtime reference: `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`
- The stable reference package is outside this repository and must not be modified.

The repository currently contains source and intentional release assets. Generated dependencies, build output, and agent/test scratch data are not part of the source baseline and are cleaned separately in this handoff operation.

## 2. Product Definition

BeCoder is a lightweight portable Code - OSS fork for C++ competitive programming (OI / ICPC).

## 3. Product Philosophy

项目负责人明确的产品原则：

> 在 BeCoder 只有原生终端是唯一接纳电脑运行环境的部分，其余都应该力求隔离系统配置，做到 BeCoder 只用自己的，系统的想法无法影响的设计哲学。
>
> BeCoder 是给用户开箱即用的东西，BeCoder IDE 把一切都准备好了，用户可以自己配置，但是完全不引导用户去自定义配置，BeCoder 打开就已经是最好的状态。

由此派生的设计边界：

- 原生终端是唯一主动接纳用户电脑运行环境的功能区域。
- Runner、clangd、内置工具链和其他 IDE 核心功能应优先使用 BeCoder 自己的路径、配置和资源，避免被系统配置、用户 PATH、外部编译器或其他全局设置影响。
- 用户可以通过正常设置进行配置，但产品界面不主动引导用户进入自定义配置流程。
- BeCoder 首次打开应直接处于项目负责人准备好的最佳默认状态，而不是要求用户先完成一组自定义配置。

The accepted core product is:

- Code - OSS editor and normal VS Code-like workbench UI.
- Built-in BeCoder setup flow.
- Built-in BeCoder Runner for C and C++.
- Built-in clangd for C++ intelligence and diagnostics.
- Bundled UCRT64 GCC 14.1.0 toolchain.
- Bundled `stdc++.h.gch` for the competitive-programming toolchain.
- Bundled custom `debugger.h`.
- Default C standard: C17.
- Default C++ standard: C++20.
- Automatic save of the focused C/C++ file before Run actions.
- Native PowerShell terminal remains a normal user terminal.
- Runner uses an isolated, BeCoder-owned execution path and must not alter the user's system environment.
- No built-in CPH, external OJ service, account login, online submission service, or GDB workflow.
- cpptools is not bundled and remains disabled. clangd is the built-in C++ language service.

The user may install CPH, other OJ extensions, and other language extensions separately.

## 3. Important Source Locations

### BeCoder setup and toolchain

- `extensions/becoder.setup/src/extension.ts`
  - First-run setup integration, toolchain configuration, default settings, compiler path validation, and repair flow.
- `extensions/becoder.setup/src/toolchainDiagnostics.ts`
  - BeCoder toolchain diagnostics panel.
- `extensions/becoder.setup/resources/windows.js`
  - Windows packaged toolchain asset definitions.
- `extensions/becoder.setup/resources/windows.json`
  - Windows setup pages and options.
- `src/vs/code/electron-main/app.ts`
  - Electron-side first-run initialization, bundled asset installation, portable toolchain paths, and default settings.

The Windows bundled archives are intentionally tracked with Git LFS:

- `resources/oi-defaults/toolchains/becoder-ucrt64.zip`
- `resources/oi-defaults/toolchains/clangd-windows-22.1.6.zip`

Do not replace these archives with extracted toolchain directories in the source tree. The `.gitattributes` rule for `resources/oi-defaults/toolchains/*.zip` must remain intact.

The configured toolchain paths are derived from the extracted BeCoder toolchain root:

- GCC: `becoder-ucrt64/bin/g++.exe`
- C compiler: `becoder-ucrt64/bin/gcc.exe`
- clangd: `clangd/clangd_22.1.6/bin/clangd.exe`
- standard headers: `becoder-ucrt64/include/c++/14.1.0`
- custom header: `becoder-ucrt64/include/c++/14.1.0/x86_64-w64-mingw32/bits/debugger.h`

### Runner

- Source extension directory: `extensions/danielpinto8zz6.c-cpp-compile-run`
- Its package identity is BeCoder Runner (`name: runner`, display name `BeCoder Runner`).
- `extensions/danielpinto8zz6.c-cpp-compile-run/resources/becoder-runner.ps1`
  - The isolated compile/run implementation.

Runner configuration keys include:

- `becoder.runner.cppStandard` (default `c++20`)
- `becoder.runner.cStandard` (default `c17`)
- `becoder.runner.cppFlags` (default `-O2`, `-Wall`, `-DDEBUG`)
- `becoder.runner.cFlags`
- `becoder.runner.cleanupExecutable` (default `true`)

### clangd

- `extensions/llvm-vs-code-extensions.vscode-clangd/src/clangd-context.ts`
  - Filters the known GCC 14.1.0 header false positive while preserving diagnostics in user source files.
- `extensions/llvm-vs-code-extensions.vscode-clangd/package.json`
  - Windows default clangd arguments enable background indexing; the single BeCoder clangd client uses a controlled environment so user-level clangd YAML cannot affect it.
- `extensions/becoder.setup/src/extension.ts`
  - Setup-generated fallback flags remain language-neutral; the managed `.clangd` applies C17 and C++20 by file extension.
- `src/vs/code/electron-main/app.ts`
  - Windows initialization writes the managed `.clangd` configuration with C17 and C++20 defaults.

On Windows, the single managed clangd client does not modify a user-authored `.clangd`; it isolates user-level clangd YAML through its process environment and uses the controlled project `.clangd` for C17/C++20 file-type rules. Native PowerShell remains the only component that receives the user's normal environment.

The filtering is intentionally narrow. It targets the known `typecheck_expression_not_modifiable_lvalue` diagnostic associated with GCC 14.1.0 headers, including diagnostics published on the user `#include` line with the real header in related information. Do not silence all clangd diagnostics.

## 4. Terminal and Runner Contract

There are two deliberately separate terminal behaviors.

### Native integrated terminal

- Retains the user's normal Windows PowerShell behavior.
- Inherits the current user and system environment.
- Can use the user's `PATH`, user-installed `g++`, `C:\msys64\ucrt64\bin\g++.exe`, `crd.ps1`, and other personal commands.
- Does not force the BeCoder compiler.
- Must not modify, delete, or overwrite the user's environment variables.

### BeCoder Runner terminal path

- Exists only to run BeCoder's compile/run workflow.
- Must use the compiler selected by BeCoder's extracted toolchain, not `PATH`, the registry, or an external compiler.
- Must not create a new terminal window for every run.
- Run and Run With Input reuse one clean Runner terminal.
- The compiler child process temporarily receives the compiler `bin` directory for DLL/tool lookup; the previous terminal `PATH` is restored immediately afterward.
- The runner script does not permanently change system or user environment variables.

Run behavior:

1. Save the focused C/C++ file.
2. Validate that the configured compiler is the bundled BeCoder compiler.
3. Compile beside the source file through a temporary executable.
4. Move the result to `<source-directory>\<source-basename>.exe`.
5. Run that executable in the source directory.
6. Delete it afterward when `becoder.runner.cleanupExecutable` is enabled.

Run With Input behavior:

- The accepted input file name is fixed as exactly `input`.
- The file must be an ordinary file in the same directory as the focused source file.
- Missing input, a directory named `input`, a different name such as `input.in`, or an input path from another directory is an error.
- The program receives the input file through standard input.
- It uses the same compile and cleanup path as Run.

The accepted UI behavior is one Run button and one visually distinct Run With Input button, with relative source paths visible in the Runner command flow and no burst of extra terminal windows.

## 5. Git and LFS State

- `origin` points to `https://github.com/Bc408/BeCoder.git`.
- `main` contains the Stage 2.4 merge commit `c028603`.
- LFS files currently tracked:
  - `becoder-ucrt64.zip`, approximately 156 MB.
  - `clangd-windows-22.1.6.zip`, approximately 28 MB.
- Remote `main` contains valid LFS pointers and `.gitattributes` rules.
- The local `git lfs fsck` check passed.
- Preserve `LICENSE`, `ThirdPartyNotices.txt`, all third-party license files, and legally required source notices.
- Do not commit `node_modules`, generated output, extracted toolchains, portable test directories, or user data.

For future stage milestones, ask the user before creating a backup commit or pushing. The handoff document itself may be reviewed before it is committed.

## 6. Known Validation

The latest successful Windows source build was:

```powershell
npm run gulp vscode-win32-x64-min
```

The latest Stage 3.1 run completed successfully in approximately 2 minutes 13 seconds. The generated portable package was written outside the source checkout at:

```text
C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64
```

The package verifier completed successfully with `-IncludeCompiler $true`. The package was approximately 710.39 MB after packaging, and the bundled `becoder-ucrt64.zip` was approximately 149.22 MB. The clean-profile first-run flow also extracted the bundled GCC and clangd assets into the package's `data\toolchains` directory during the handoff attempt.

A successful Gulp result or package-verifier result proves packaging and required-file presence; it does not by itself prove that the GUI starts, first-run extraction works for a user, or Run/Run With Input works in a clean profile.

### Build handoff and user acceptance boundary

Once the requested source checks, Gulp build, and direct package verification succeed, the implementation task's build phase is complete. The built package is then handed to the user for manual portable acceptance. The user, rather than the coding agent, performs the final GUI and interaction acceptance against `portable_stage2_4_verified`.

The coding agent must not continue by opening the built application, clicking through onboarding, executing Run or Run With Input, or claiming runtime acceptance unless the user explicitly requests agent-run verification in a later instruction. The agent may report build output, package-verifier output, artifact paths, and known static checks; these are not substitutes for the user's acceptance.

The user acceptance checklist remains:

- Start the package with clean user data.
- Confirm automatic extraction and the presence of `g++.exe`, `clangd`, `stdc++.h.gch`, and `debugger.h`.
- Confirm C++20 defaults, automatic save before running, and no false diagnostics for `bits/stdc++.h`, `scanf`, or `debugger.h`.
- Confirm Run and Run With Input, one Runner terminal only, and no burst of extra terminal windows.
- Confirm native PowerShell keeps the user's own `PATH`, `g++`, `crd.ps1`, and other commands.
- Confirm Runner uses only BeCoder's compiler and does not read `PATH`, the registry, or download a compiler.
- Confirm Run With Input accepts only a same-directory ordinary file named exactly `input`; missing files, directories, `input.in`, and files from another directory must fail.
- Compare the resulting interface and behavior with `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`.

The standard source validation sequence is documented in `AGENTS.md`:

```powershell
npm run typecheck-client
npm run compile-oi-extensions
npm run gulp vscode-win32-x64-min
```

Use the external command-runner timeout rules in `AGENTS.md`. A non-zero exit code or external timeout is a failed step. Do not automatically continue to runtime checks after a failed build.

After dependencies are reinstalled, the next clean validation should separately cover:

- source type checking;
- OI extension compilation;
- Windows package build;
- clean-profile startup;
- bundled toolchain extraction;
- clangd diagnostics for `bits/stdc++.h`, `scanf`, and `debugger.h`;
- one Runner terminal only;
- Run and Run With Input.

## 7. Unfinished Stage Plan

The following plan is the current project boundary. A stage is not complete merely because its source build succeeds; the stated acceptance work must also be completed.

### Stage 3.1: Bug-fix acceptance

The implementation, Windows portable build, and manual acceptance against `portable_stage2_4_verified` have been completed and accepted by the project owner.

The accepted behavior includes:

- clean-profile startup and automatic toolchain extraction;
- presence and usability of `g++.exe`, `gcc.exe`, clangd, `stdc++.h.gch`, and `debugger.h`;
- C17 and C++20 defaults, while retaining user-selectable Runner settings;
- automatic save before Run;
- no false diagnostics for `bits/stdc++.h`, `scanf`, or `debugger.h`;
- Run and Run With Input behavior;
- exactly one reusable Runner terminal and no burst of new terminal windows;
- native PowerShell retaining the user's own PATH, g++, `crd.ps1`, and other commands;
- Runner using only BeCoder's compiler without PATH, registry, or download fallback;
- strict same-directory ordinary-file validation for a file named exactly `input`;
- comparison with `C:\Users\Bc\Desktop\BeCoder\portable_stage2_4_verified`.

### Stage 3.2: C/C++ language mode diagnostics

The supplied evidence shows a `.c` file containing multiple variable-length arrays such as `a[n][m]`, `b[m][k]`, and `c[n][k]` being reported as C++ extensions (`clang(-Wvla-extension)`). The file tree reports six problems. When the popup is closed, the problem count and squiggles remain; when opened, the popup identifies `b[m][k]` as a C++ VLA extension. This stage addresses the persistent diagnostic and language-mode boundary without changing valid C/C++ semantics.

Implementation plan:

- reproduce the report with a clean profile and an existing workspace, including first open, clangd startup, configuration reload, file reopen, and clangd restart;
- inspect the active document language ID, clangd compile command, fallback flags, managed `.clangd` fragments, and diagnostic publication order to determine whether a stale C++ configuration is briefly applied;
- make `.c` deterministically use the C compiler and selected C standard, and `.cc`/`.cpp`/`.cxx` deterministically use the C++ compiler and selected C++ standard throughout startup and reanalysis;
- ensure managed configuration changes trigger a consistent clangd reload or restart, while preserving user-authored `.clangd` files;
- keep legitimate diagnostics enabled: a C17 variable-length array must not be reported as a C++ VLA extension, while the same construct in C++ may remain a valid diagnostic;
- verify `stdio.h`, `scanf`, C17 syntax, C++20 syntax, `bits/stdc++.h`, and genuinely invalid code in both fresh and already configured workspaces;
- run the required type checks, OI extension compilation, portable build, and focused user acceptance after the fix.

Stage 3.2 is separate from Stage 3.10 performance optimization. It must not hide diagnostics or change the Run/Run With Input performance target.

Implementation status (current working tree, not yet accepted):

- The confirmed failure source was a user-level `C:\Users\Bc\AppData\Local\clangd\config.yaml` that added `-std=c++20` and selected an old `portable_stage1` `g++.exe`. Project `.clangd` fragments load before that user configuration, so appending `-std=c17` alone cannot correct a `.c` document.
- The built-in Windows clangd client now isolates the single BeCoder clangd process from external user-level clangd YAML configuration. The controlled project `.clangd` applies C17 to `.c` files and C++20 to C++ source/header extensions, while the client uses BeCoder's managed GCC-compatible target/include fallback flags.
- `stdio.h`, `string.h`, `scanf`, C17 variable-length arrays, C++20 concepts, and a deliberately undeclared identifier were checked with the bundled clangd. The valid probes completed with zero errors; the invalid probe retained one diagnostic.
- `npm run typecheck-client`, `npm run compile-oi-extensions`, and the focused clangd/setup TypeScript checks passed. The Windows portable Gulp build reached the packaging phase but stopped at `clean-vscode-win32-x64` with `EBUSY` because running `BeCoder.exe` processes held `C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64` open. No retry, process termination, output deletion, or runtime acceptance was performed.
- Stage 3.2 remains incomplete until a clean portable build succeeds and the project owner performs the required clean-profile and C/C++ interaction acceptance.

### Stage 3.3: Marketplace, local plugins, and AI cleanup

Marketplace and local plugin work:

- integrate the VS Marketplace in the Code - OSS manner;
- provide extension search, browsing, installation, uninstall, and update;
- import local `.vsix` files;
- preserve built-in clangd when other extensions are installed;
- keep cpptools out of the built-in package and disabled;
- do not restore GDB, ShortestPath login, submission, or online OJ services.

AI cleanup work:

- remove the right-side AI chat view;
- remove AI-related settings, commands, views, keybindings, and extension contributions;
- verify the result with clean user data.

### Stage 3.10: Performance optimization

This stage contains both execution latency and highlighting latency.

Run and Run With Input:

- first record `compileMs`, `runMs`, and `totalMs`;
- locate the 5 to 7 second delay across toolchain checks, PowerShell startup, compiler startup, compiler arguments, temporary executable handling, terminal dispatch, and repeated initialization;
- reduce the user-visible total time to no more than 2 seconds;
- preserve the one-Runner-terminal contract, compiler isolation, native PowerShell behavior, input validation, and existing interaction contract.

Highlighting:

- measure the stable approximately 3 second delay before complete syntax/semantic highlighting;
- identify whether the cost is in clangd, semantic tokens, syntax tokenization, inlay hints, or editor refresh;
- reduce the delay without losing complete highlighting or reintroducing false diagnostics.

Both performance tracks require a baseline before optimization and separate verification after each focused change.

### Stage 4: Toolchain slimming and final release

Toolchain slimming:

- analyze the GCC/UCRT64 archive's real dependencies;
- remove only content proven unnecessary for C/C++20 compile/run, clangd, `stdc++.h.gch`, and `debugger.h`;
- preserve the original Git LFS archive as a recoverable source;
- rebuild and test after every controlled reduction;
- record compressed and extracted sizes while preserving offline extraction.

First-launch experience:

- completely remove the first-open custom configuration page;
- open directly with the project owner's BeCoder defaults;
- keep user configuration possible through normal settings without guiding users through customization.

Final release verification:

- rebuild a clean Windows portable package after Stage 3.3, Stage 3.10, and toolchain slimming;
- repeat clean-profile extraction, compiler, clangd, Runner, terminal isolation, and native PowerShell checks;
- repeat the full comparison with `portable_stage2_4_verified`.

## 8. Cleanup and Working Rules

- Do not edit generated `out/`, `.build/`, `out-build/`, `out-vscode-min/`, extension `dist/`/`out/`, or dependency directories directly.
- Run `npm ci` when a future build needs dependencies after this cleanup.
- Do not use `npm run compile` as TypeScript validation; use the commands in `AGENTS.md`.
- Do not clean caches or delete artifacts during a normal build unless the user explicitly asks for cleanup.
- Do not modify the stable reference package outside this repository.
- Do not change the user's Windows PATH or other environment variables.
- Keep third-party notices and LFS archive pointers intact.
- Keep changes narrow and close to the existing Code - OSS architecture.
