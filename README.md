# BeCoder

[简体中文](README_cn.md)

BeCoder is a self-contained Windows editor for OI, ICPC, and everyday C/C++ competitive-programming work, with Beacon as its built-in AI companion. Install it once and begin coding with the compiler, code intelligence, diagnostics, and run environment already prepared. Beacon is optional; model setup is not needed to edit, compile or run code.

BeCoder is derived from **Code - OSS 1.140.0**, uses **Electron 43.7.3** for its desktop runtime, and sets its extension API compatibility version to **1.140.0**. It is an independent product and does not share product data or configuration with a system installation of Visual Studio Code. The upstream migration updates the editor, workbench UI, and APIs used by existing BeCoder features; upstream Copilot, Chat, Agents, and MCP features are not bundled. Beacon remains BeCoder's optional AI companion.

## Main Features

- A bundled GCC 16.2.0 toolchain with C17 and C++20 defaults.
- **Run** and **Run With Input** actions backed by BeCoder Runner. Run With Input reads an ordinary same-directory file named exactly `input`.
- The dedicated BC panel for BeCoder-owned compile and run operations, alongside the complete native PowerShell terminal for normal system commands.
- GCC-based editor diagnostics and bundled clangd for completion, hover, definitions, references, rename, formatting, semantic highlighting, and optional inlay hints.
- A protected, offline, read-only PDF viewer for contest problem statements, with search, zoom, thumbnails, and outlines.
- BeCoder One Monokai, Better C++ Syntax, and the Seti file icon theme.
- The 1.140 Modern UI with rounded workbench surfaces and switchable Default/Compact layout density.
- Explorer, search, Tasks, Markdown, Mermaid, notebooks, the built-in browser, authentication, and normal editor and terminal workflows.
- Simplified Chinese and English interfaces.
- Open VSX extension discovery and local VSIX installation.
- Built-in CPH sample testing and problem import from the integrated browser.
- Beacon conversations with configurable models, read-only file access, web search and image input when the selected model supports them.

## Appearance and Layout Density

Modern UI is enabled by default, with rounded corners, floating side bars and a bottom panel, and refreshed editor tabs, menus, and dialogs. The default layout leaves space between workbench parts.

Open the **Manage** gear menu and choose **Layout Density → Default** or **Compact**. Compact removes gaps between workbench parts and reduces internal spacing to leave more room for content. Changes take effect immediately and are saved in `window.density.layout` as `default` or `compact`.

To use the classic workbench appearance, turn off `workbench.experimental.modernUI` in Settings. Layout Density applies only while Modern UI is enabled. Existing values for these settings take precedence over the defaults.

## From a Problem to a Submission

1. Open and trust your contest workspace. Choose an Online Judge on the Welcome page to open it in the integrated browser, then navigate to a supported problem page. Sign in on the website if it requires an account.
2. After the page finishes loading, choose **Import Problem** in the browser toolbar. BeCoder imports the displayed samples into CPH and creates or reuses a C/C++ source in the selected workspace. Existing source contents are preserved. When import creates a source editor group, it appears to the left of the problem browser.
3. Write your solution and press **Ctrl+Alt+B** to run the CPH samples, or **Ctrl+Alt+D** to focus the judge. Samples can be edited, added, removed, or imported from JSON. You can rerun one sample, inspect output differences, or stop the active run. CPH metadata is stored in the workspace's `.cph` directory.
4. Copy your solution from the source editor and paste it into the OJ's submission editor. Select the website's language/compiler and submit there. BeCoder does not submit automatically; passing local samples does not establish online acceptance. Local `debug(...)`/`dout` helpers are BeCoder conveniences: remove them or provide a compatible definition before submission to an OJ that lacks them.

The bundled parsers cover Codeforces, AtCoder, Luogu, Lanqiao, NowCoder, SPOJ, CSES, HDOJ, AcWing, LibreOJ (including its archive), and the explicitly supported DMOJ sites: DMOJ, MOI Arena, Le Quy Don Online Judge, VNOI Online Judge, and A.Y. Jackson Online Judge. Import supports non-interactive C/C++ problems with standard input/output. PDF/resource-dependent problems and arbitrary DMOJ/Hydro instances are not supported. Website layout changes, login requirements and access restrictions can prevent parsing; see [parser verification boundaries](extensions/becoder.cph/test/fixtures/OJ-SOURCES.md).

Under **Settings → Extensions → BeCoder IDE Features**, **Welcome Page: Websites** maps names to HTTP/HTTPS URLs; **Welcome Page: Visible Websites** selects their display order. The default visible sites are Codeforces, AtCoder, Luogu, Lanqiao, NowCoder and HDOJ. Add a name and URL to the first setting, then the same name to the second. Changes take effect immediately; an empty display list hides the section. Adding a shortcut does not add a problem parser.

## BeCoder NoteBook

BeCoder NoteBook provides native `.bcnb` / `.bcnb-backup` documents, independent input text cells, source-associated notes and user-requested execution of the nearest preceding C/C++ block. Images use short attachment references; each input retains its latest result and compile/run timing in the Notebook file; eligible execution evidence goes into its independent Beacon queue. See the [Notebook extension](extensions/becoder.notebook/README.md) and [implementation status](docs/beacon/implementation-status.md). Beacon can create a Notebook, associate it with source, edit an existing Notebook and make a complete pre-edit backup. Complete OJ workflows and the remaining end-to-end acceptance scenarios are tracked in the implementation status; these are not implied by the available editing tools.

## Beacon

This section describes the implemented Beacon capabilities. The [implementation status](docs/beacon/implementation-status.md) records coverage and remaining validation separately from the full [Beacon and NoteBook baseline](docs/beacon/README.md).

Open Beacon from the editor's upper-right toolbar. Its settings button opens a separate settings tab: configure DeepSeek, Alibaba Cloud Bailian, Moonshot or Ollama, fetch or add models, then select a chat model. Each provider has one connection and each model ID has one configuration. API keys use SecretStorage; local Ollama needs no key. Model capabilities and optional generation parameters can be adjusted in the same page.

Beacon supports streaming replies, Markdown, code highlighting and formulas. Code blocks use the editor's font size and line height with fixed One Monokai syntax colors. Pausing retains the partial answer. With an empty composer, Continue appends a new response to that answer; sending new text keeps it as conversation context. Regenerate replaces the answer and its later branch. Enter sends; Shift+Enter adds a newline.

Each window selects a Beacon workspace independently of editor folders. Without a usable workspace only Blackout is available; a valid selection defaults to Spot and also permits Flood. Spot reads that Beacon root; Flood may read other local and shared files. Both exclude credentials and other conversation assets. Permissions are checked before and after file reads. Explicit drops and Add files capture only the user-supplied files in all modes; sending reuses captured bytes. Images require confirmed vision support; binary excerpts do not imply document, audio or video understanding.

Web search is enabled by default, has a globe toggle and requires confirmed tool support. Exa search needs no search key; sources have links and availability depends on the service. Network and model setting changes apply to the next response. File mode changes revoke subsequent reads and discard in-flight stale results.

In Spot/Flood, Beacon can create or edit Notebooks on an explicit request, with a backup of the latest in-memory document before editing and native save. Models do not modify student C/C++ files, run commands or submit solutions. Persistent conversations are fixed to the selected workspace under `.beaconWork`; same-root windows share the list but a chat opens in one window only. Temporary conversations remain in memory; workspace selection alone does not migrate them. Workspace switching shows the target list without creating a chat. The approved mode-transition change is undergoing implementation validation: explicit mode changes keep the page, text and captured attachments; Spot/Flood share an identity, while the first accepted new question after crossing Blackout/persistent categories creates an independent full-context snapshot and clears the consumed source draft. A deliberate Blackout-to-persistent send saves that inherited context in the new chat. See the [mode and inheritance design](docs/beacon/mode-conversation-design.md); this statement does not claim runtime acceptance. Development-era global-history import has been removed. Captured Runner/CPH evidence is available through the workspace queues and model reading tools. All modes can read open text editors, loaded Notebook cells and outputs, rendered browser text, and text extracted from loaded PDFs by physical page. PDF extraction is not OCR or full visual/formula understanding. Execution records require a usable workspace and are saved to the active conversation before delivery. Coverage limits and remaining acceptance work are recorded in the [implementation status](docs/beacon/implementation-status.md) and [Beacon guide](extensions/becoder.beacon/README.md).

### Confirmed Design Direction

Beacon is being designed as a long-term algorithm-learning companion with limited, explicitly requested writing of notebooks, handouts and diagrams. It will not create or modify the student's C/C++ source files or autonomously run programs or submit solutions. Each window independently chooses a Beacon workspace; `.beaconWork` owns its history and memory, while associated `.bcnb` documents use the editor folder's separate `.notebook`.

The confirmed design extends beyond the available tools: dedicated four-platform OJ submission/verdict adapters, simple workspace tips/status memory, user-triggered dream consolidation and complete visual page materials still need implementation and validation. Learning-asset writes beyond the current Notebook tools are also part of the broader design. The [formal documents](docs/beacon/README.md) retain those first-version requirements.

## Compilation and Output

Run, Run With Input and CPH share Runner's bundled GCC, language-standard settings, validated flags and private child environment. CPH's old C/C++ Args settings are deprecated and ignored. Local compilation uses `-O2`, `-Wall`, `-DDEBUG` and UTF-8. The gear menu's **Generate gch Cache** action removes old toolchain caches and generates an optional `bits/stdc++.h.gch` beside the universal header for the current user C++ settings. GCC use is verified before reporting success. Caches are not shipped or required by toolchain health checks; absent or incompatible caches use ordinary headers for C++11/14/17/20/23. Generation shows progress; keep BeCoder open until it finishes. Concurrent generation requests are refused. After changing C++ compiler settings, generate the cache again if you want a matching cache. No CPH or ONLINE_JUDGE macro or static solution linkage is added implicitly.

At startup, BeCoder checks the toolchain manifest and key compiler/language-service files. A failed check offers the latest Setup for reinstallation. This is a readiness check, not continuous monitoring of every header; missing headers encountered by GCC are reported through compilation diagnostics.

BC Run and Run With Input present stdout and stderr through ConPTY rather than independently merging two JavaScript pipe callbacks. Normal language/runtime buffering still applies. Run With Input snapshots the same-directory `input` file before compilation, feeds its bytes without terminal echo, and closes stdin at EOF. CPH instead retains separate stdout and stderr pipes: stdout is compared with expected output while stderr is shown separately and ignored for verdicts by default. Its executable and working directory are private to each request; relative-file behavior therefore differs from BC Run's source-directory working directory. CPH is a sample tester, not a sandbox or an OJ-equivalent memory-limit enforcer.

Optional custom CPH checkers use a user-installed Python interpreter, an explicit exception to the private C/C++ toolchain. The protocol is `python script input-file actual-output-file`; exit code zero passes and expected output is not passed to the checker. Ordinary C/C++ sample testing does not require Python.

Beyond Beacon's focused conversation and learning tools, the current product does not include a general-purpose MCP client, Debug/GDB, Source Control/Git UI or remote development. Git remains usable as an external command in the native terminal.

## Install and First Launch

BeCoder is distributed through a Setup installer for 64-bit Windows 10 and later. Setup offers two installation modes:

- **Native application (recommended):** creates a machine-level Windows uninstall entry and generated uninstaller, plus `BeCoder.lnk` directly in the public Start-menu Programs folder. Only one native installation is supported per computer; reinstall into its registered directory or uninstall it before choosing a different location.
- **Fully Portable:** does not create an uninstall entry or write BeCoder installation state to the Windows registry. Multiple independent copies may coexist. Copy the complete directory to removable storage or another Windows machine and run BeCoder from there.

Setup requests administrator authorization on launch in both modes. Inno Setup directly manages native Start-menu shortcuts; no separate shortcut helper or later elevation is used. The optional current-user desktop shortcut remains selected by default in both modes. Portable mode cannot replace the registered native directory.

1. Run Setup and select a dedicated installation folder. The path must contain only ASCII characters, must be no longer than 70 characters, and cannot be a drive root. The default is `%LOCALAPPDATA%\Programs\BeCoder`.
2. Choose Native application or Fully Portable mode. Native application is selected by default.
3. The desktop-shortcut checkbox is selected by default in both modes. Clear it if you do not need a shortcut, especially when installing BeCoder on removable storage.
4. On the first normal launch, BeCoder opens the bundled `coding\helloCoder.cpp` sample. Only this installation-provided onboarding folder is trusted automatically.

The installed BeCoder directory is self-contained and may be moved as a complete directory, including to a removable drive. Separate BeCoder directories keep independent application data and toolchains.

## Data and Uninstall

The application keeps settings, installed extensions, caches, legacy history and extracted toolchains in the installation directory’s `data` folder, independent of system Visual Studio Code. Beacon stores workspace conversations in the selected root’s `.beaconWork`; source-associated notebooks use the editor folder's separate `.notebook`. These workspace assets are separate from installation-private data.

Reinstalling into an existing BeCoder installation replaces its private data, including legacy Beacon history. Back up needed installation data before replacement; profile export is not a complete chat backup. User workspaces and `.beaconWork` outside the installation are not part of Setup replacement.

Native application mode provides the familiar Windows uninstall entry. Uninstall removes the Setup-installed program files, the entire installation `data` folder, the ownership marker, the native uninstall registration and generated shortcuts. Files added separately outside `data` may remain. User workspaces and `.beaconWork` or `.notebook` folders outside the installation are preserved. If a Native application installation is manually moved, BeCoder can continue to run but its Windows uninstall entry is no longer guaranteed to point to the moved directory.

Neither mode changes PATH or creates file associations, protocol registrations, services or startup tasks. Fully Portable mode also creates no registry-based uninstaller or Start-menu entry. To remove a Portable installation, close BeCoder and delete its complete installation directory. Delete the desktop shortcut separately if you chose to create one.

## Extensions and Updates

Open VSX is the only configured online extension registry. Local VSIX installation is available. BeCoder's protected built-in components cannot be replaced through the gallery, and incompatible Microsoft C/C++ extension packages are blocked.

Application updates and their settings are currently disabled. BeCoder does not perform in-app update checks. New versions can be obtained from [GitHub Releases](https://github.com/Bc408/BeCoder-IDE/releases) and installed as an explicit replacement.

## License and Source

BeCoder source is available at [github.com/Bc408/BeCoder-IDE](https://github.com/Bc408/BeCoder-IDE).

BeCoder modifications are distributed under [GPL-3.0-or-later](LICENSE). Code - OSS 1.140.0 remains under the MIT License, and bundled third-party components retain their own licenses and notices. See [ThirdPartyNotices.txt](ThirdPartyNotices.txt) and the [bundled component inventory](resources/oi-defaults/BUNDLED-COMPONENTS.json) for provenance and license details.

Report product or security problems through [GitHub Issues](https://github.com/Bc408/BeCoder-IDE/issues).
