# 发行与安装维护

[文档目录](README.md) · [开发指南](development.md) · [使用指南](getting-started.md)

本文维护当前安装与载荷约束，取代已完成的安装器、gch 和包体积专项执行记录。具体实现以 [Inno Setup 脚本](../build/win32/becoder.iss)、[工具链组装](../build/lib/becoderToolchain.ts)及直接验证器为依据；本文不是一次新构建、安装或运行验收的证明。

## v2.2.0 源码版本

2026-11-27，负责人确认将应用源码版本更新为`2.2.0`，本轮接入已审定的Beacon上下文提示词：旧观察与新活动、共享队列及latest、Notebook输入配对、Runner／CPH编译稿来源、CPH配置路径与长文本截断取舍。提示内部版本为`2026-11-27.1`，具体接入和验证见[记录](beacon/review/2026-11-27-product-context-prompts-installed.md)。

本轮只进行离线工程验证与对应分支的源码提交／推送，不进行Beacon模型问答或API测试，不新构建stage、Setup或创建GitHub Release。先前stage及访谈对应其原始版本，不代表2.2.0安装包或新提示效果已验收。

## v2.1.1 发行范围（历史）

- `feat(oj-connect)`：新增默认关闭的 ACM 模式。开启后隐藏题目难度、标签和逐测试点评测详情，保留整体评测状态和源码入口。已打开的 OJ Connect 页面会随个人设置即时更新。完整显示规则见 [OJ Connect 使用说明](../extensions/becoder.oj-connect/README.md)。
- `fix(workbench)`：编辑器布局菜单在菜单项变化时复用已有监听器，避免刷新时反复重建菜单。
- `fix(browser)`：保留网站从空白新标签发起的后续导航，使比赛题目能够在新标签中打开并保留原比赛页。

发行资产为 Windows x64 的 `BeCoderSetup-x64-2.1.1.exe`。实际发布与资产记录见 `v2.1.1` Release。

## v2.1.0 交付状态

2026-11-20，OJ Connect 五站、内置浏览器与统一主页的维护修复已完成，源码检查、stage、完整包及管理员 Setup 验证均通过，负责人已确认本次 2.1.0 Setup 验收通过。沿用五站核心闭环及各站现有题型、C/C++ 范围；不将未逐项验证的异常或语言组合描述为已实测。确切安装包、哈希与证据见 [交付记录](oj-connect/release-2.1.0-regression.md)，修复与性能分别见[审查](oj-connect/release-2.1.0-review.md)和[测量](oj-connect/release-2.1.0-performance.md)。正式 Release 尚未发布，版本交付不自动授权 Git 或 Release 发布。

Setup 只接受未运行的发行 stage。构建前的只读纯净检查拒绝额外根文件、运行配置、浏览器会话/缓存、用户扩展及非初始源码；不替用户删除这些内容。已运行的开发 stage 应保全后重新构建，GUI 检查使用独立数据目录。OJ 的语法、字体、worker/WASM、站点标识和完整声明必须随包；最终源文件集合及字节与 stage 对账。

## v2.0.0 范围决策（历史）

负责人于 2026-10-23 确认：v2.0.0 交付当时已实现能力；已确认但尚未实现的需求作为后续版本开发事项保留，不作为该轮补功能的前置条件。当时后续版本号和排期另定，当前产品使用与发行说明见[文档目录](README.md)。

该轮范围确认不代表缺陷、数据/权限边界、源码与包/Setup 检查或实际体验验收自动通过，也不自动授权修改版本、构建、Git 发布或云端工作流；后续版本同样分别记录这些证据。

## 安装模式与数据所有权

同一 Windows x64 Setup 提供两种模式，均在启动时申请管理员权限：

| 模式 | 系统集成 | 多份安装 |
| --- | --- | --- |
| 原生应用版（默认） | 固定 AppId、机器级卸载登记、Inno 管理的公共开始菜单 `BeCoder.lnk` 及卸载器 | 每台电脑一份；更换目录前先卸载，原登记目录可明确同意后完整覆盖 |
| 完全 Portable 版 | 不登记卸载器或公共开始菜单，不写入安装状态注册表 | 可有多份独立副本；不能覆盖已登记的原生安装目录 |

两种模式均保留默认勾选、可取消的当前用户桌面快捷方式任务。开始菜单由 Inno 的 `[Icons]` 直接维护，不使用独立快捷方式 helper 或延迟提权。没有旧安装快照、旧快捷方式或用户级登记的自动迁移。

程序、设置、扩展、缓存和工具链位于安装目录及其 `data` 内；应整体移动。原生安装手动移动后，Windows 卸载登记不会自动更新。两种模式均不修改 PATH，不注册文件关联、协议、服务或开机任务。

安装路径须为专用目录，规范化后的路径仅含 ASCII，长度最多 70 字符，不能直接使用磁盘根或经重解析点重定向的路径。非空目录必须具有有效的 BeCoder 所有权标记，不能仅凭目录名认定为可覆盖安装。

覆盖安装先要求明确的数据丢失同意，再删除原安装整体内容，包括 `data`、`coding` 及用户自行放入的文件；只有安装目录外的工作区不受此次替换影响。静默覆盖必须显式传入 `/BECODERALLOWDATALOSS=1`，静默 Portable 选择为 `/BECODERPORTABLE=1`。这是数据破坏授权参数，不作为日常重装建议。删除不完整时停止，不继续混装。

原生卸载删除 Setup 安装的文件、整个 `data`、所有权标记、卸载登记和所创建的快捷方式；用户自行加入且位于 `data` 外的文件可能保留。Portable 无卸载器，关闭应用后由用户删除整目录，桌面快捷方式需另行处理。安装目录外的工作区、`.beaconWork` 和 `.notebook` 不属于安装清理范围。

## 载荷约束

- GCC、clangd、必要头文件、运行库、功能资源与许可证支持离线使用。源码中的工具链归档是 Git LFS 发行资产，不能用本机解压目录替换。
- gch 属于用户可主动生成的缓存，不随包携带或在构建时生成，不参与安装健康必需项；保留原始万能头及 debugger.h。配置、生成生命周期及验证要求统一见 [Runner 编译配置](../extensions/danielpinto8zz6.c-cpp-compile-run/docs/COMPILER_SETUP.md)。
- Windows x64 只过滤已审查的 `7zip-bin` 非目标平台文件，不卸载整个包、不按构建宿主猜目标、不扩大为通用平台清理。未知文件和其他 target 保守保留；版本或清单变化需重新审查。
- 精确清单由 [sevenZip.ts](../build/lib/sevenZip.ts) 维护。保留 `index.js`、`package.json`、`LICENSE.txt`、`7x.sh`、`win/x64/7za.exe` 的原字节和 ASAR packed 布局，并校验目标可执行文件为 AMD64。
- node-pty 原生符号及共享 TypeScript 仍保留，不以当前未发现静态消费者作为删除许可。进一步裁剪共享 TypeScript 前，应在隔离环境建立 manifest/lock/实际依赖一致的基线，并验证 JSON、工作台和实际扩展入口；旧包探针不能代表新输入。
- Setup 使用 `lzma2/ultra64` 与 solid compression。不承诺固定下载体积或加速倍数；压缩调优须在同载荷下独立比较，不能与删文件收益混算。

## 构建与验证入口

完整发行任务使用以下真实入口，执行前按 [AGENTS.md](../AGENTS.md) 核对范围、依赖、输入及命令：

1. `npm run typecheck-client`、`npm run compile-oi-extensions`，再执行 `npm run gulp vscode-win32-x64-min`。
2. 对该次 staged 应用运行 [verify-becoder-package.ps1](../build/azure-pipelines/win32/verify-becoder-package.ps1)，参数包含 `-PackagePath` 和 `-IncludeCompiler $true`。
3. `npm run gulp -- vscode-win32-x64-becoder-setup` 构建 `.build/win32-x64/becoder-setup/BeCoderSetup-x64-<版本>.exe`。
4. 对该次 Setup 运行 [verify-becoder-setup.ps1](../build/azure-pipelines/win32/verify-becoder-setup.ps1)，明确传入 `-SetupPath` 与 `-StagedPackagePath`。

仅请求构建时不自动扩展到以上全部步骤。直接验证器会检查各自范围，成功不代表 GUI、真实模型、账号或项目负责人验收；最终 Setup 交由负责人接受，未授权不启动日常安装。涉及安装、删除、替换或路径规则的改动，按[文件系统安全审查](../.agents/skills/develop-becoder/references/filesystem-safety-review.md)核对所有权及越界保护。

载荷裁剪的验证需比较实际路径与内容，只允许批准项变化；7zip 应由打包 Electron 使用包内 loader 和 helper 完成压缩/解压回环，不能借系统工具或开发依赖补齐。安装器改动需覆盖新建、明确同意覆盖、外来目录、路径/重解析点保护、两种模式、快捷方式、登记及卸载的数据边界。无界面检查不替代目标机或 ARM64 x64 仿真的实际运行证据。

发布工作流 [release.yml](../.github/workflows/release.yml)仅手动触发；构建工作流 [build-windows.yml](../.github/workflows/build-windows.yml)也是手动入口。发布条件、负责人授权及稳定版本标签规则统一由 [develop-becoder](../.agents/skills/develop-becoder/SKILL.md)维护，更新 main 或创建标签不会自动授权云端重建。

两个云工作流的原生绑定补建命令从 [.npmrc](../.npmrc) 读取 Electron 目标版本，并通过 `exec.ps1` 传播各验证与原生命令的失败；当前版本为 `43.7.3`。这修正了 workflow 内容，不等于已经完成云端构建、安装包或运行验收。
