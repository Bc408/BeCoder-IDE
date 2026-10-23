# 发行与安装维护

[文档目录](README.md) · [开发指南](development.md) · [使用指南](getting-started.md)

本文维护当前安装与载荷约束，取代已完成的安装器、gch 和包体积专项执行记录。具体实现以 [Inno Setup 脚本](../build/win32/becoder.iss)、[工具链组装](../build/lib/becoderToolchain.ts)及直接验证器为依据；本文不是一次新构建、安装或运行验收的证明。

## v2.0.0 交付范围

负责人于 2026-10-23 确认：v2.0.0 交付当前已实现能力；已确认但尚未实现的需求作为后续版本开发事项保留，不作为本次补功能的前置条件。后续版本号和排期另定，具体实现覆盖见[文档目录](README.md)及 [Beacon / NoteBook 当前状态](beacon/implementation-status.md)。

发布前仍须审查现有功能的缺陷与数据/权限边界，完成候选源码、版本元数据、回归检查、包/Setup 验证及当前功能的实际体验验收。范围确认不代表这些检查已经通过，也不自动授权修改版本、构建、Git 发布或云端工作流。

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
