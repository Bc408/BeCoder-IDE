# BeCoder

[简体中文](README_cn.md)

BeCoder is a self-contained Windows editor for OI, ICPC, and everyday C/C++ competitive-programming work. Install it once and begin coding with the compiler, code intelligence, diagnostics, and run environment already prepared.

BeCoder is derived from **Code - OSS 1.130** and retains extension API compatibility with **1.130.0**. It is an independent product and does not share product data or configuration with a system installation of Visual Studio Code.

## Main Features

- A bundled GCC toolchain with C17 and C++20 defaults.
- **Run** and **Run With Input** actions backed by BeCoder Runner. Run With Input reads an ordinary same-directory file named exactly `input`.
- The dedicated BC panel for BeCoder-owned compile and run operations, alongside the complete native PowerShell terminal for normal system commands.
- GCC-based editor diagnostics and bundled clangd for completion, hover, definitions, references, rename, formatting, semantic highlighting, and optional inlay hints.
- BeCoder One Monokai, Better C++ Syntax, and the Seti file icon theme.
- Explorer, search, Tasks, Markdown, Mermaid, notebooks, the built-in browser, authentication, and normal editor and terminal workflows.
- Simplified Chinese and English interfaces.
- Open VSX extension discovery and local VSIX installation.

BeCoder deliberately does not provide AI, Chat, Agent, MCP, Debug/GDB, Source Control/Git UI, or remote-development product capabilities. Git remains usable as an external command in the native terminal.

## Install and First Launch

BeCoder is distributed through a Setup installer for 64-bit Windows 10 and later.

1. Run Setup and select a dedicated installation folder. The path must contain only ASCII characters, must be no longer than 70 characters, and cannot be a drive root. The default is `%LOCALAPPDATA%\Programs\BeCoder`.
2. The optional desktop-shortcut checkbox is off by default. It is not recommended when installing BeCoder on removable storage.
3. On the first normal launch, BeCoder opens the bundled `coding\helloCoder.cpp` sample. Only this installation-provided onboarding folder is trusted automatically.

The installed BeCoder directory is self-contained and may be moved as a complete directory, including to a removable drive. Separate BeCoder directories keep independent application data and toolchains.

## Data and Uninstall

BeCoder stores its settings, installed extensions, caches, history, and extracted toolchains under the installation directory's `data` folder. It does not use the user data of system Visual Studio Code or another BeCoder installation.

Reinstalling into an existing BeCoder installation is a complete replacement and removes that installation's private data. Export any profiles you need with BeCoder's built-in profile export before replacing it. User projects outside the BeCoder installation directory are not part of Setup replacement.

BeCoder creates no registry-based uninstaller, Start-menu entry, PATH change, file association, protocol registration, service, or startup task. To uninstall it, close BeCoder and delete its complete installation directory. If you explicitly created a desktop shortcut, delete that shortcut separately.

## Extensions and Updates

Open VSX is the only configured online extension registry. Local VSIX installation is available. BeCoder's protected built-in components cannot be replaced through the gallery, and incompatible Microsoft C/C++ extension packages are blocked.

Application updates and their settings are currently disabled. BeCoder does not perform in-app update checks. New versions can be obtained from [GitHub Releases](https://github.com/Bc408/BeCoder-IDE/releases) and installed as an explicit replacement.

## License and Source

BeCoder source is available at [github.com/Bc408/BeCoder-IDE](https://github.com/Bc408/BeCoder-IDE).

BeCoder modifications are distributed under [GPL-3.0-or-later](LICENSE). Code - OSS 1.130 remains under the MIT License, and bundled third-party components retain their own licenses and notices. See [ThirdPartyNotices.txt](ThirdPartyNotices.txt) and the [bundled component inventory](resources/oi-defaults/BUNDLED-COMPONENTS.json) for provenance and license details.

Report product or security problems through [GitHub Issues](https://github.com/Bc408/BeCoder-IDE/issues).
