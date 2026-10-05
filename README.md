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

## Beacon

Open Beacon from the editor's upper-right toolbar. Its settings button opens a separate settings tab: configure DeepSeek, Alibaba Cloud Bailian, Moonshot or Ollama, fetch or add models, then select a chat model. Each provider has one connection and each model ID has one configuration. API keys use SecretStorage; local Ollama needs no key. Model capabilities and optional generation parameters can be adjusted in the same page.

Beacon supports streaming replies, Markdown, code highlighting and formulas. Code blocks use the editor's font size and line height with fixed One Monokai syntax colors. Pausing retains the partial answer. With an empty composer, Continue appends a new response to that answer; sending new text keeps it as conversation context. Regenerate replaces the answer and its later branch. Enter sends; Shift+Enter adds a newline.

File access defaults to **No file access**. **Workspace read-only** allows files within the open folders, including unsaved editor text; **Computer read-only** allows other local files and network shares under operating-system permissions. Both reading modes block known credential and private files. Workspace mode accepts file drops only from BeCoder; computer mode also accepts Explorer drops and offers Add files. Images require confirmed vision support; Beacon does not automatically switch models or perform OCR. Binary excerpts do not imply document, audio or video understanding.

Web search is enabled by default, has a globe toggle in the composer, and requires confirmed model tool support. The limited Exa-backed search needs no search key. Sources are shown with links; availability depends on the network and service limits. Permission, network and model-setting changes during generation apply to the next response.

Beacon does not write your project files, run commands or submit solutions. Messages and included file/image contents go to the configured model service. Search queries and public page URLs go to the search service. Chat history is saved locally in Beacon's global extension storage; changing workspaces does not split or clear the list. Current problem statements, samples and run results do not yet have a dedicated structured connection to Beacon. See the [Beacon guide](extensions/becoder.beacon/README.md) for implementation details and limits.

## Compilation and Output

Run, Run With Input and CPH share Runner's bundled GCC, language-standard settings, validated flags and private child environment. CPH's old C/C++ Args settings are deprecated and ignored. Local compilation uses `-O2`, `-Wall`, `-DDEBUG` and UTF-8; C++ loads the bundled standard precompiled header when compatible, with a textual fallback for the supported C++11/14/17/20/23 standards. No CPH or ONLINE_JUDGE macro or static solution linkage is added implicitly.

BC Run and Run With Input present stdout and stderr through ConPTY rather than independently merging two JavaScript pipe callbacks. Normal language/runtime buffering still applies. Run With Input snapshots the same-directory `input` file before compilation, feeds its bytes without terminal echo, and closes stdin at EOF. CPH instead retains separate stdout and stderr pipes: stdout is compared with expected output while stderr is shown separately and ignored for verdicts by default. Its executable and working directory are private to each request; relative-file behavior therefore differs from BC Run's source-directory working directory. CPH is a sample tester, not a sandbox or an OJ-equivalent memory-limit enforcer.

Optional custom CPH checkers use a user-installed Python interpreter, an explicit exception to the private C/C++ toolchain. The protocol is `python script input-file actual-output-file`; exit code zero passes and expected output is not passed to the checker. Ordinary C/C++ sample testing does not require Python.

Beyond Beacon's focused conversation and read-only tools, the current product does not include a general-purpose MCP client, Debug/GDB, Source Control/Git UI or remote development. Git remains usable as an external command in the native terminal.

## Install and First Launch

BeCoder is distributed through a Setup installer for 64-bit Windows 10 and later.

1. Run Setup and select a dedicated installation folder. The path must contain only ASCII characters, must be no longer than 70 characters, and cannot be a drive root. The default is `%LOCALAPPDATA%\Programs\BeCoder`.
2. The optional desktop-shortcut checkbox is off by default. It is not recommended when installing BeCoder on removable storage.
3. On the first normal launch, BeCoder opens the bundled `coding\helloCoder.cpp` sample. Only this installation-provided onboarding folder is trusted automatically.

The installed BeCoder directory is self-contained and may be moved as a complete directory, including to a removable drive. Separate BeCoder directories keep independent application data and toolchains.

## Data and Uninstall

BeCoder stores its settings, installed extensions, caches, history, and extracted toolchains under the installation directory's `data` folder. It does not use the user data of system Visual Studio Code or another BeCoder installation.

Reinstalling into an existing BeCoder installation is a complete replacement and removes that installation's private data, including Beacon history. Back up needed data before replacement; built-in profile export should not be treated as a complete chat backup. User projects outside the BeCoder installation directory are not part of Setup replacement.

BeCoder creates no registry-based uninstaller, Start-menu entry, PATH change, file association, protocol registration, service, or startup task. To uninstall it, close BeCoder and delete its complete installation directory. If you explicitly created a desktop shortcut, delete that shortcut separately.

## Extensions and Updates

Open VSX is the only configured online extension registry. Local VSIX installation is available. BeCoder's protected built-in components cannot be replaced through the gallery, and incompatible Microsoft C/C++ extension packages are blocked.

Application updates and their settings are currently disabled. BeCoder does not perform in-app update checks. New versions can be obtained from [GitHub Releases](https://github.com/Bc408/BeCoder-IDE/releases) and installed as an explicit replacement.

## License and Source

BeCoder source is available at [github.com/Bc408/BeCoder-IDE](https://github.com/Bc408/BeCoder-IDE).

BeCoder modifications are distributed under [GPL-3.0-or-later](LICENSE). Code - OSS 1.140.0 remains under the MIT License, and bundled third-party components retain their own licenses and notices. See [ThirdPartyNotices.txt](ThirdPartyNotices.txt) and the [bundled component inventory](resources/oi-defaults/BUNDLED-COMPONENTS.json) for provenance and license details.

Report product or security problems through [GitHub Issues](https://github.com/Bc408/BeCoder-IDE/issues).
