# 许可证与第三方来源

BeCoder 主产品的公开许可标识是 **GPL-3.0-or-later**，完整条款见根目录 [LICENSE](../LICENSE)。这一标识与 `product.json` 一致；独立组件、继承代码、字体、图标和工具链保留各自的许可证与版权声明，不能将整个仓库的文件一律视为同一种许可。

本页是阅读入口，不替代各组件的完整法律文本。英文法律文本保持原文。English readers can use the component links below and the retained English notices.

## 总入口

- [ThirdPartyNotices.txt](../ThirdPartyNotices.txt)：产品第三方声明、扩展入口和继承的依赖许可全文。
- [BUNDLED-COMPONENTS.json](../resources/oi-defaults/BUNDLED-COMPONENTS.json)：随包组件的版本、来源、修改说明、许可证路径和工具链归档哈希；它是主要组件清单，不是全部传递依赖的完整 SBOM。
- [MIT-VSCode.txt](MIT-VSCode.txt)：Code - OSS 的 Microsoft MIT 许可。保留源文件中的 Microsoft 版权和 MIT 声明。
- [MIT-Electron.txt](MIT-Electron.txt)：Electron 的 MIT 许可；Electron 随附的 Chromium 等依赖声明仍属于运行时发行文件。

## BeCoder 组件与扩展

| 组件 | 已声明的许可与例外 | 许可证、来源与修改记录 |
| --- | --- | --- |
| BeCoder 主产品 | GPL-3.0-or-later；继承的 Code - OSS 部分保留 MIT 声明 | [根 LICENSE](../LICENSE)、[Code - OSS MIT](MIT-VSCode.txt) |
| Runner（基于 C/C++ Compile Run） | GPL v3；扩展清单为 `GPL-3.0`，组件清单按 `GPL-3.0-only` 记录 | [LICENSE](../extensions/danielpinto8zz6.c-cpp-compile-run/LICENSE)、[上游仓库](https://github.com/danielpinto8zz6/c-cpp-compile-run) |
| BeCoder CPH | CPH 派生代码为 GPL-3.0-or-later；Competitive Companion 解析器、React 等保留 MIT；Codicons 字体为 CC-BY-4.0 | [LICENSE](../extensions/becoder.cph/LICENSE)、[UPSTREAM.md](../extensions/becoder.cph/UPSTREAM.md)、[第三方声明](../extensions/becoder.cph/ThirdPartyNotices.txt)、[解析器 MIT](../extensions/becoder.cph/companion/LICENSE) |
| Beacon | 自有代码为 MIT；适配的 AI Elements、Captain Who 代码和样式为 Apache-2.0；LobeHub 服务图标为 MIT；依赖与语法资源各自保留许可 | [LICENSE](../extensions/becoder.beacon/LICENSE)、[UPSTREAM.md](../extensions/becoder.beacon/UPSTREAM.md)、[AI Elements](../extensions/becoder.beacon/licenses/ai-elements.txt)、[Captain Who](../extensions/becoder.beacon/licenses/captain-who.txt)、[LobeHub](../extensions/becoder.beacon/licenses/lobe-icons.txt) |
| BeCoder NoteBook | 自有扩展为 GPL-3.0-or-later；复用的 Microsoft Notebook ANSI 工具为 MIT | [LICENSE](../extensions/becoder.notebook/LICENSE)、[Microsoft MIT](MIT-VSCode.txt)、[ANSI 源码](../extensions/notebook-renderers/src/ansi.ts) |
| Setup 扩展 | MIT | [LICENSE](../extensions/becoder.setup/LICENSE) |
| GCC Diagnostics | 自有代码为 MIT；GCC Unicode 显示宽度数据为 GPL-3.0-or-later | [MIT LICENSE](../extensions/becoder.gcc-diagnostics/LICENSE)、[数据 NOTICE](../extensions/becoder.gcc-diagnostics/NOTICE)、[GPL 全文](../LICENSE) |
| Webview 共享 hover helper | MIT；它是共享源码，不是独立安装的扩展 | [LICENSE](../extensions/becoder.shared/LICENSE) |
| One Monokai | MIT，保留 Joshua Azemoh 版权 | [LICENSE](../extensions/becoder.one-monokai/LICENSE) |
| vscode-clangd | MIT；扩展和 clangd 二进制是两个许可入口 | [扩展 LICENSE](../extensions/llvm-vs-code-extensions.vscode-clangd/LICENSE)；二进制见下表 |
| CodeSnap | MIT，保留 Adrien Pyke 版权 | [LICENSE](../extensions/aadityanarayan.code-snap/LICENSE) |
| PDF Viewer / PDF.js | Apache-2.0；CMaps、ICC、字体和 WASM 组件保留各自附加许可 | [LICENSE](../extensions/mathematic.vscode-pdf/LICENSE)、[第三方声明与资源许可清单](../extensions/mathematic.vscode-pdf/ThirdPartyNotices.txt) |
| Better C++ Syntax | MIT，保留 Jeff Hykin 版权 | [语法许可](../extensions/cpp/better-cpp-syntax-license.txt) |
| Seti / Mermaid Markdown / 简体中文语言包 | Code - OSS MIT 与各扩展保留的第三方声明 | [Seti 声明](../extensions/theme-seti/ThirdPartyNotices.txt)、[Mermaid 声明](../extensions/mermaid-markdown-features/ThirdPartyNotices.txt)、[语言包 LICENSE](../extensions/MS-CEINTL.vscode-language-pack-zh-hans/LICENSE.md)、[语言包声明](../extensions/MS-CEINTL.vscode-language-pack-zh-hans/ThirdPartyNotices.txt) |

Beacon 的 [build.mjs](../extensions/becoder.beacon/build.mjs) 根据实际捆绑依赖生成 `dist/ThirdPartyNotices.txt`；NoteBook 的 [build.mjs](../extensions/becoder.notebook/build.mjs) 生成 `dist/THIRD_PARTY_NOTICES.txt`。这些文件随构建生成，不应直接修改。使用共享 hover helper 的扩展还会随包提供 `dist/HoverLicense.txt`。

## 工具链与源码记录

| 内容 | 许可和来源入口 |
| --- | --- |
| clangd Windows 归档 | Apache-2.0 WITH LLVM-exception；版本、上游发行页、SHA-256 和归档内 `LICENSE.TXT` 位置见 [组件清单](../resources/oi-defaults/BUNDLED-COMPONENTS.json) |
| MSYS2 UCRT64 GCC 工具链 | 各包分别许可，包含 GPL、LGPL、GCC Runtime Library Exception、MIT、BSD、Zlib 等；精确表达式与包版本见 [ucrt64-packages.json](../resources/oi-defaults/toolchains/ucrt64-packages.json)，完整文本见 [ucrt64-licenses](../resources/oi-defaults/toolchains/ucrt64-licenses) |
| MSYS2 构建配方 | [ucrt64-sources/recipes](../resources/oi-defaults/toolchains/ucrt64-sources/recipes) 保留固定提交的 PKGBUILD、补丁和辅助文件；提交与摘要在 [包清单](../resources/oi-defaults/toolchains/ucrt64-packages.json) 的 `recipes` 中 |
| BeCoder 工具链装配 | [assemble-becoder-ucrt64.ps1](../build/win32/assemble-becoder-ucrt64.ps1) 与 [becoder-debugger.h](../resources/oi-defaults/toolchains/becoder-debugger.h) 记录本地装配和附加头文件；PCH 与 DLL 复制项见包清单的 `unownedArchiveEntries` |

包清单的 `licenseFieldSemantics` 说明许可字段保留 MSYS2 原始元数据，不应为了形式统一改写。工具链归档是 Git LFS 管理的发布资源，许可索引不会替代、解压或重建它们。

`recipes` 保留的是构建配方，不是全部上游源码归档的镜像。查找相应源码时，以包清单固定的 recipe 提交及其中的 `source`、校验值和补丁为依据；BeCoder 修改的扩展源码在本仓库对应 `extensions/` 路径中。发布具体二进制时，还需要将发布版本/提交与这些源码记录对应；本文档清理本身不构成新的发布或源码可获取性验证。

## 保留与更新原则

新增或更新实际随包组件时，同步记录版本、固定来源、修改情况、版权、完整许可证和必要的源码入口。保留原始版权、NOTICE、许可证全文及相应源码记录；不能用本页摘要替换它们。仅作设计参考而未复制代码或资产的项目，应在来源记录中说明参考性质，不能误报为随包依赖。
