# BeCoder

[English](README.md)

BeCoder 是一款面向算法竞赛（OI / ICPC）的轻量化 portable 编辑器，基于 Code - OSS 构建。它提供适合竞赛开发的 C++ 编辑、编译和本地运行体验。

## 功能

- 面向算法竞赛的 C++ 编辑、编译与运行默认配置
- 内置 BeCoder setup、BeCoder Runner、clangd 和 C++ 编辑支持
- 默认使用 C++20，并支持格式化、代码片段和工具链诊断
- Windows portable 包可携带 UCRT64 GCC 14.1.0、clangd、`stdc++.h.gch` 和 `debugger.h`
- 支持从 VS Marketplace 安装扩展，也支持导入本地 VSIX 文件
- 内置简体中文语言包和竞赛相关编辑扩展

## 本地工作流

BeCoder 的 Run 和 Run With File 命令使用 portable 包内的编译器。Run With File 固定查找当前 C/C++ 文件同目录下的 `input` 文件；没有找到或发现多个不匹配的输入文件时，会先提示用户。编译生成的可执行文件位于源文件目录，运行结束后按配置清理。

BeCoder Runner 使用隔离的工具链环境，只提供 BeCoder 自己的运行命令；它不修改系统环境变量，也不会与用户 PATH 中的编译器冲突。原生集成终端仍保持 PowerShell 的正常行为，可以继续使用用户自己的 PATH、`g++`、脚本和其他命令。

CPH、其他 OJ 扩展和其他语言扩展不属于 BeCoder 核心服务。需要时可以从 VS Marketplace 安装，或通过扩展管理器导入本地 VSIX 文件。

## 从源码构建

在本目录执行：

```bash
npm ci
npm run compile
./scripts/code.sh --locale zh-cn --user-data-dir ./tmp/becoder-dev
```

构建 macOS Apple Silicon 包：

```bash
npm run compile-oi-extensions
npm run gulp vscode-darwin-arm64-min
```

构建 Windows x64 包：

```bash
npm run compile-oi-extensions
npm run gulp vscode-win32-x64-min
```

## 使用的开源项目与许可证

BeCoder 使用 [GPL-3.0-or-later](LICENSE) 作为仓库许可证。项目包含、修改或捆绑的开源组件仍适用其各自许可证；下面列出主要来源，不构成完整的第三方依赖清单。

| 项目 | 用途 | 许可证 |
| --- | --- | --- |
| [Code - OSS](https://github.com/microsoft/vscode) | 上游编辑器代码库 | [MIT](licenses/MIT-VSCode.txt) |
| BeCoder Runner | C/C++20 编译和运行支持 | GPL-3.0 |
| [vscode-clangd](https://github.com/clangd/vscode-clangd) | clangd 编辑器集成 | MIT |
| [CodeSnap](https://github.com/kufii/CodeSnap) | 代码截图 | MIT |
| [Better C++ Syntax](https://github.com/jeff-hykin/better-cpp-syntax) | C++ 语法高亮 | MIT |
| [VS Code 简体中文语言包](https://github.com/Microsoft/vscode-loc) | 简体中文界面本地化 | MIT |

完整的第三方版权和许可证声明见 [ThirdPartyNotices.txt](ThirdPartyNotices.txt)，也请保留各扩展目录中附带的许可证文件。本说明不构成法律意见。

## 反馈与贡献

请通过 [Issues](https://github.com/Bc408/BeCoder/issues) 报告问题或提出建议。提交改动前，请运行与改动相符的编译或测试命令。
