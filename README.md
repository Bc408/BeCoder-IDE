# BeCoder

[简体中文](README_cn.md)

BeCoder is a lightweight portable editor for competitive programming (OI / ICPC), built on Code - OSS. It provides C++-oriented defaults, local build and run workflows, and toolchain configuration suited to contest development.

## Features

- Competitive-programming-focused C++ editor, build, and run defaults
- VS Marketplace access for optional OJ and language extensions
- Built-in BeCoder setup, Runner, clangd, and C/C++ editing support
- clangd, formatting, snippets, and toolchain diagnostics
- Toolchain setup flows for Windows, macOS, and Linux
- Bundled Simplified Chinese language pack and contest-oriented extensions

## Local workflow

BeCoder's Run and Run With File commands use the compiler bundled with the portable distribution. Run With File uses a same-directory `input` file and reports missing or ambiguous input files before execution. The integrated terminal remains the user's normal Windows terminal environment, including its own `PATH`, `g++`, and PowerShell scripts.

Optional CPH and other OJ integrations can be installed from VS Marketplace or imported as local VSIX files. They are not part of the BeCoder core services.


## Build from source

Run the following from this directory:

```bash
npm ci
npm run compile
./scripts/code.sh --locale zh-cn --user-data-dir ./tmp/becoder-dev
```

Build a macOS Apple Silicon package:

```bash
npm run compile-oi-extensions
npm run gulp vscode-darwin-arm64-min
```

Build a Windows x64 package:

```bash
npm run compile-oi-extensions
npm run gulp vscode-win32-x64-min
```

## Open-source projects and licenses

BeCoder is licensed under [GPL-3.0-or-later](LICENSE). Open-source components included, modified, or bundled by this project remain under their respective licenses. The table below identifies principal sources; it is not a complete third-party dependency inventory.

| Project | Purpose | License |
| --- | --- | --- |
| [Code - OSS](https://github.com/microsoft/vscode) | Upstream editor codebase | [MIT](licenses/MIT-VSCode.txt) |
| BeCoder Runner | C/C++20 compile-and-run support with `$gcc` diagnostics | GPL-3.0 |
| [vscode-clangd](https://github.com/clangd/vscode-clangd) | clangd editor integration | MIT |
| [CodeSnap](https://github.com/kufii/CodeSnap) | Source-code screenshots | MIT |
| [Better C++ Syntax](https://github.com/jeff-hykin/better-cpp-syntax) | C++ syntax highlighting | MIT |
| [VS Code Simplified Chinese Language Pack](https://github.com/Microsoft/vscode-loc) | Simplified Chinese UI localization | MIT |

See [ThirdPartyNotices.txt](ThirdPartyNotices.txt) for full third-party copyright and license notices. Preserve the license files included with individual extensions as well. This notice is not legal advice.

## Feedback and contributions

Please use [Issues](https://github.com/KevinHuangIsLearning/BeCoder/issues) to report bugs or suggest improvements. Before submitting changes, run the compilation or tests relevant to your change.
