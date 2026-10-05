# BeCoder

[English](README.md)

BeCoder 是一款面向 OI、ICPC 和日常 C/C++ 竞赛编程的 Windows 自包含编辑器，内置 AI 助手 Beacon。安装完成后，编译器、代码智能、编辑器诊断和运行环境已经准备就绪，可以直接开始编程。Beacon 按需使用；编辑、编译和运行代码不需要配置模型。

BeCoder 源自 **Code - OSS 1.140**，并保留 **1.140.0** 扩展 API 兼容版本。BeCoder 是独立产品，不与系统中安装的 Visual Studio Code 共用产品数据或配置。

## 主要功能

- 内置 GCC 16.2.0 工具链，默认使用 C17 和 C++20。
- 由 BeCoder Runner 提供的“运行”和“使用输入运行”。“使用输入运行”读取源文件同目录下名称严格为 `input` 的普通文件。
- 专用于 BeCoder 编译和运行流程的 BC 面板，同时完整保留可执行普通系统命令的原生 PowerShell 终端。
- GCC 编辑器诊断；内置 clangd 提供补全、悬停、定义、引用、重命名、格式化、语义高亮和可选内嵌提示。
- 受保护、离线且只读的 PDF 竞赛题面阅读器，支持搜索、缩放、缩略图和目录。
- BeCoder One Monokai、Better C++ Syntax 和 Seti 文件图标主题。
- Explorer、搜索、Tasks、Markdown、Mermaid、Notebook、内置浏览器、身份验证，以及普通编辑器和终端工作流。
- 简体中文和英文界面。
- Open VSX 扩展发现和本地 VSIX 安装。
- 内置 CPH 样例评测与内置浏览器题目导入。
- Beacon 对话、模型配置、只读文件访问、联网搜索，以及模型支持时的图片输入。

## 从题目到提交

1. 打开并信任自己的竞赛工作区。在欢迎页选择 OJ，使用内置浏览器进入支持的题目页面；网站需要登录时，在网站中完成登录。
2. 页面加载完成后，点击浏览器工具栏的“导入题目”。BeCoder 将页面样例导入 CPH，并在选定工作区创建或复用 C/C++ 源文件，保留已有源码内容。导入产生新的源码编辑器组时，该组位于题目浏览器左侧。
3. 编写解答，按 **Ctrl+Alt+B** 运行 CPH 样例，按 **Ctrl+Alt+D** 聚焦评测器。支持编辑、添加、删除样例和从 JSON 导入样例，也可单独重跑、查看输出差异或停止当前运行。CPH 元数据保存在工作区的 `.cph` 目录中。
4. 从源码编辑器复制解答，粘贴到 OJ 提交编辑器，在网站中选择语言和编译器并提交。BeCoder 不自动提交；本地样例通过不等于在线评测通过。本地 `debug(...)`、`dout` 是 BeCoder 辅助功能，提交到没有这些定义的 OJ 前，需要移除相关调用或自行提供兼容定义。

内置解析器覆盖 Codeforces、AtCoder、洛谷、蓝桥杯、牛客、SPOJ、CSES、HDOJ、AcWing、LibreOJ（含归档站），以及明确支持的 DMOJ 站点：DMOJ、MOI Arena、Le Quy Don Online Judge、VNOI Online Judge、A.Y. Jackson Online Judge。导入仅支持非交互式、标准输入输出的 C/C++ 题目，不支持依赖 PDF 或额外资源的题目，也不会自动支持任意 DMOJ/Hydro 实例。网站结构变化、登录要求和访问限制可能导致解析失败；参见[解析器验证边界](extensions/becoder.cph/test/fixtures/OJ-SOURCES.md)。

在 **设置 → 扩展 → BeCoder IDE 功能** 中，“欢迎页：网站列表”登记名称和 HTTP/HTTPS URL，“欢迎页：显示的网站”控制显示内容与顺序。默认显示 Codeforces、AtCoder、洛谷、蓝桥杯、牛客和 HDOJ。先在前者添加名称与 URL，再在后者加入相同名称；修改立即生效，清空显示列表会隐藏该区域。添加快捷入口不会自动增加题目解析能力。

## Beacon

点击编辑器右上角的 Beacon 图标打开对话。设置按钮打开独立设置标签页：配置深度求索、阿里云百炼、月之暗面或 Ollama，获取或手动添加模型，再选择聊天模型。每个服务商一组连接，同一模型 ID 一份配置。密钥通过 SecretStorage 保存，本机 Ollama 无需密钥；模型能力与可选生成参数可在同一页面调整。

Beacon 支持流式回答、Markdown、代码高亮和公式。代码块字号与行高同步编辑器，语法配色固定使用 One Monokai。暂停保留部分回答；输入框为空时，“继续”将新输出续接到原回答；发送新文字时，部分回答保留为上下文。“重新回答”替换该回答及其后续分支。Enter 发送，Shift+Enter 换行。

文件权限默认是“不读取文件”。“工作区只读”允许读取当前打开的文件夹，包含编辑器未保存的文本；“全机只读”允许读取其他本地文件与网络共享路径，沿用系统权限。两档都拦截已知凭据与隐私文件。工作区档只接受 BeCoder 内拖来的文件；全机档也接受资源管理器拖入，并显示“添加文件”。图片需要确认模型支持视觉，不自动切换模型或执行 OCR；二进制节选不代表具备文档、音频或视频理解能力。

联网默认开启，输入框的地球按钮可切换，模型需确认支持工具。有限的 Exa 搜索服务无需搜索密钥，结果展示来源链接，实际可用性受网络与服务限制影响。生成中修改权限、联网开关或模型设置，下一次回复生效。

Beacon 不写项目文件、不执行命令、不提交解答。消息与纳入的文件／图片内容发送给配置的模型服务；搜索词与公开网页地址发送给搜索服务。聊天历史保存在 Beacon 本地全局扩展存储，切换工作区不会分区或清空。目前题面、样例与运行结果尚未结构化接入 Beacon。实现细节与限制见 [Beacon 说明](extensions/becoder.beacon/README.md)。

## 编译与输出

运行、使用输入运行和 CPH 共用 Runner 的内置 GCC、语言标准设置、受校验的编译参数和私有子进程环境。CPH 旧的 C/C++ Args 设置已弃用并忽略。本地编译使用 `-O2`、`-Wall`、`-DDEBUG` 和 UTF-8；C++ 在兼容时加载内置标准预编译头，并为支持的 C++11/14/17/20/23 标准提供文本头文件回退。不隐式添加 CPH、ONLINE_JUDGE 宏或解答程序的静态链接参数。

BC 的运行和使用输入运行通过 ConPTY 呈现 stdout/stderr，不再由两条独立的 JavaScript 管道回调合并输出；程序语言与运行库本身的缓冲规则仍然有效。使用输入运行在编译前保存同目录 `input` 文件的快照，将字节无回显地送入 stdin，并在文件结束时关闭输入。CPH 则保留独立 stdout/stderr 管道：stdout 用于答案比较，stderr 单独展示，默认不影响判定。CPH 的可执行文件和运行目录归当前请求私有，因此相对文件访问行为与在源码目录运行的 BC 不同。CPH 是样例测试工具，不提供沙箱或等同线上 OJ 的内存限制执行能力。

可选的 CPH 自定义检查器使用用户安装的 Python，这是私有 C/C++ 工具链之外的明确例外。调用协议为 `python script input-file actual-output-file`，退出码为零表示通过，不向检查器传递期望输出。普通 C/C++ 样例评测无需 Python。

除 Beacon 的对话与只读工具外，当前产品不包含通用 MCP 客户端、Debug/GDB、Source Control/Git 图形界面或远程开发。Git 仍可作为外部命令在原生终端中使用。

## 安装与首次启动

BeCoder 通过面向 64 位 Windows 10 及更高版本的 Setup 安装程序发行。

1. 运行 Setup 并选择一个专用安装文件夹。路径只能包含 ASCII 字符、总长度不得超过 70 个字符，并且不能直接使用磁盘根目录。默认路径为 `%LOCALAPPDATA%\Programs\BeCoder`。
2. “创建桌面快捷方式”默认不勾选。向可移动存储介质安装 BeCoder 时不建议勾选。
3. 第一次正常启动时，BeCoder 会打开随安装提供的 `coding\helloCoder.cpp` 示例。只有这个由安装程序提供的入门文件夹会被自动信任。

安装完成后的 BeCoder 目录是自包含目录，可以整体移动，也可以移动到可移动存储介质。多份 BeCoder 目录分别保存独立的应用数据和工具链。

## 数据与卸载

BeCoder 将设置、用户安装扩展、缓存、历史记录和解压后的工具链保存在安装目录内的 `data` 文件夹中。BeCoder 不使用系统 Visual Studio Code 或其他 BeCoder 安装的数据。

向已有 BeCoder 安装目录重新安装属于完整替换，会删除该安装内的私有数据，包含 Beacon 历史。替换前请备份需要保留的数据，不要将内置配置文件导出当作完整聊天备份。BeCoder 安装目录外的用户项目不属于 Setup 替换范围。

BeCoder 不创建基于注册表的卸载器、开始菜单项、PATH 修改、文件关联、协议注册、服务或启动任务。卸载时，关闭 BeCoder 并删除完整安装目录即可。如果曾经明确选择创建桌面快捷方式，还需要单独删除该快捷方式。

## 扩展与更新

Open VSX 是 BeCoder 唯一配置的在线扩展源，同时支持安装本地 VSIX。BeCoder 受保护的内置组件不能由扩展市场替换，不兼容的 Microsoft C/C++ 扩展包会被阻止。

当前关闭了应用更新功能和相关设置，BeCoder 不会在应用内检查更新。新版本可从 [GitHub Releases](https://github.com/Bc408/BeCoder-IDE/releases) 获取，并由用户明确执行替换安装。

## 许可证与源码

BeCoder 源码位于 [github.com/Bc408/BeCoder-IDE](https://github.com/Bc408/BeCoder-IDE)。

BeCoder 修改内容以 [GPL-3.0-or-later](LICENSE) 许可发布。Code - OSS 1.140 继续遵循 MIT 许可证，内置第三方组件保留各自的许可证与声明。组件来源和许可证详情见 [ThirdPartyNotices.txt](ThirdPartyNotices.txt) 与[内置组件清单](resources/oi-defaults/BUNDLED-COMPONENTS.json)。

产品问题或安全问题请通过 [GitHub Issues](https://github.com/Bc408/BeCoder-IDE/issues) 报告。
