# BeCoder

[English](README.md)

BeCoder 是一款面向 OI、ICPC 和日常 C/C++ 竞赛编程的 Windows 自包含编辑器。安装完成后，编译器、代码智能、编辑器诊断和运行环境已经准备就绪，可以直接开始编程。

BeCoder 源自 **Code - OSS 1.130**，并保留 **1.130.0** 扩展 API 兼容版本。BeCoder 是独立产品，不与系统中安装的 Visual Studio Code 共用产品数据或配置。

## 主要功能

- 内置 GCC 工具链，默认使用 C17 和 C++20。
- 由 BeCoder Runner 提供的“运行”和“使用输入运行”。“使用输入运行”读取源文件同目录下名称严格为 `input` 的普通文件。
- 专用于 BeCoder 编译和运行流程的 BC 面板，同时完整保留可执行普通系统命令的原生 PowerShell 终端。
- GCC 编辑器诊断；内置 clangd 提供补全、悬停、定义、引用、重命名、格式化、语义高亮和可选内嵌提示。
- BeCoder One Monokai、Better C++ Syntax 和 Seti 文件图标主题。
- Explorer、搜索、Tasks、Markdown、Mermaid、Notebook、内置浏览器、身份验证，以及普通编辑器和终端工作流。
- 简体中文和英文界面。
- Open VSX 扩展发现和本地 VSIX 安装。

BeCoder 明确不提供 AI、Chat、Agent、MCP、Debug/GDB、Source Control/Git 图形界面和远程开发产品能力。Git 仍可作为外部命令在原生终端中使用。

## 安装与首次启动

BeCoder 通过面向 64 位 Windows 10 及更高版本的 Setup 安装程序发行。

1. 运行 Setup 并选择一个专用安装文件夹。路径只能包含 ASCII 字符、总长度不得超过 70 个字符，并且不能直接使用磁盘根目录。默认路径为 `%LOCALAPPDATA%\Programs\BeCoder`。
2. “创建桌面快捷方式”默认不勾选。向可移动存储介质安装 BeCoder 时不建议勾选。
3. 第一次正常启动时，BeCoder 会打开随安装提供的 `coding\helloCoder.cpp` 示例。只有这个由安装程序提供的入门文件夹会被自动信任。

安装完成后的 BeCoder 目录是自包含目录，可以整体移动，也可以移动到可移动存储介质。多份 BeCoder 目录分别保存独立的应用数据和工具链。

## 数据与卸载

BeCoder 将设置、用户安装扩展、缓存、历史记录和解压后的工具链保存在安装目录内的 `data` 文件夹中。BeCoder 不使用系统 Visual Studio Code 或其他 BeCoder 安装的数据。

向已有 BeCoder 安装目录重新安装属于完整替换，会删除该安装内的私有数据。替换前请使用 BeCoder 内置的配置文件导出功能导出需要保留的配置。BeCoder 安装目录外的用户项目不属于 Setup 替换范围。

BeCoder 不创建基于注册表的卸载器、开始菜单项、PATH 修改、文件关联、协议注册、服务或启动任务。卸载时，关闭 BeCoder 并删除完整安装目录即可。如果曾经明确选择创建桌面快捷方式，还需要单独删除该快捷方式。

## 扩展与更新

Open VSX 是 BeCoder 唯一配置的在线扩展源，同时支持安装本地 VSIX。BeCoder 受保护的内置组件不能由扩展市场替换，不兼容的 Microsoft C/C++ 扩展包会被阻止。

当前关闭了应用更新功能和相关设置，BeCoder 不会在应用内检查更新。新版本可从 [GitHub Releases](https://github.com/Bc408/BeCoder-IDE/releases) 获取，并由用户明确执行替换安装。

## 许可证与源码

BeCoder 源码位于 [github.com/Bc408/BeCoder-IDE](https://github.com/Bc408/BeCoder-IDE)。

BeCoder 修改内容以 [GPL-3.0-or-later](LICENSE) 许可发布。Code - OSS 1.130 继续遵循 MIT 许可证，内置第三方组件保留各自的许可证与声明。组件来源和许可证详情见 [ThirdPartyNotices.txt](ThirdPartyNotices.txt) 与[内置组件清单](resources/oi-defaults/BUNDLED-COMPONENTS.json)。

产品问题或安全问题请通过 [GitHub Issues](https://github.com/Bc408/BeCoder-IDE/issues) 报告。
