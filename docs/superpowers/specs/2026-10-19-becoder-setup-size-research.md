# BeCoder 安装包瘦身专项技术调研

日期：2026-10-19
状态：三轮调研完成，含隔离无界面探针；未经实施批准，不代表完整候选包已验收
研究对象：Windows x64、2.0.0-beta Setup 与当前 staged application
原则：保留现有能力、性能预期、离线完整性、诊断条件和安装行为；不以体积目标倒逼删除。

## 1. 结论与推荐

最终推荐：第一批仅考虑 **7zip-bin 的非目标平台文件精准过滤**，维持现有压缩配置。其路径/内容差异和当前 Windows x64 的 ASAR helper 回环已经过临时研究探针验证，正式构建与完整验收仍待实施。压缩调优如继续，应作为同载荷的独立实验，不与删文件混合；目前没有改变压缩配置的实证依据。

另有 node-pty 的两份 PDB 共 10.14 MiB，可以作为“符号与正式包分离”的条件候选。它们不在普通运行加载路径，但对原生故障定位有价值。默认保留，只有确认允许改变符号交付方式，并验证匹配符号可恢复后才推进，不能把“不影响正常启动”等同于“毫无能力变化”。

TypeScript 共享依赖 22.65 MiB 的静态审计与当前 JSON server 受控运行对照已进一步支持“发行残留”判断，但当前 JSON 安装依赖与受跟踪 lock 漂移，尚未验证新基线及完整工作台，不批准删除。GCC/PCH、clangd、Electron DLL、Mermaid、Beacon 高亮、PDF 字体与 CMap、本地化和许可材料，本期保持完整。最终分级和停止条件以第 16 节为准；第 3–15 节保留前两轮发现及当时的证据边界。

没有证据支持承诺可以在上述约束下压到 150 MB、160 MB 或任何预设大小。若安全候选收益很小，接受有限收益。测试也不能数学证明没有未知缺陷；实际控制手段是缩小变更面、保留未知依赖、比较最终载荷、真实消费者验证及可回退交付。

## 2. 产品理解、边界与授权

- 产品用途：离线自包含的 Windows C/C++ 竞赛环境，编辑、诊断、补全、编译、运行和样例测试开箱可用；Beacon 服务不可用不影响核心编程。
- 所有权：构建脚本决定发行载荷；Runner 拥有共享编译策略，CPH/Notebook 复用它；GCC diagnostics 与 clangd 有独立运行消费者；Setup 拥有安装、覆盖、快捷方式和卸载集成。
- 当前事实：分支 `codex/BeCoder_Next`，HEAD `7483bfcf`；工作区存在上一轮安装器及验证脚本的既有改动，本轮保留。
- 本轮授权：深度技术调研和方案交付。未修改产品代码/依赖/打包规则，未清理产品文件，未构建应用或 Setup，未启动图形工作台，未提交或推送。第三轮在专用 tmp 下生成研究脚本/ASAR/fixture，仅以实际 Electron-as-Node 运行受控无界面探针，见第 16 节。
- 保护行为：Native/Portable 模式、当前用户默认安装路径、数据随安装、默认桌面快捷方式、公共开始菜单及按需提权、卸载图标、路径和所有权检查、明确同意后覆盖、离线工具链和整体移动能力。
- 验收边界：静态分析、内存压缩与第 16 节限定的无界面运行均是调研证据；不是完整候选应用、Setup 或 GUI 的通过证据。实施必须另行批准。

## 3. 实测基线与历史比较的限制

### 3.1 Setup

MB = 1,000,000 字节，MiB = 1,048,576 字节。以下统一列原始字节与 MiB。

| 本机文件 | 字节 | MiB | SHA-256 |
| --- | ---: | ---: | --- |
| 当前 `BeCoderSetup-x64-2.0.0-beta.exe` | 191,415,857 | 182.548 | `58E7539EADC9304ACFB500D30D9EFEE67180B852C16FE543DC5E2C6C5E9943CF` |
| 桌面留存 `BeCoderSetup-x64-1.2.0.exe` | 186,275,970 | 177.647 | `E9E98BAB02F582EDA66E77F1C193410B55A95B0E1701B67810188464150331CF` |

这两个实际文件相差 **5,139,887 字节 / 4.902 MiB / 2.759%**。当前包按十进制是 191.416 MB；不能将用户此前提到的 192m、175m，或不同时间构建的包直接作为同口径差值。

当前文件位于仓库 `.build/win32-x64/becoder-setup/`；旧文件位于 `C:/Users/Bc/Desktop/BeCoderSetup-x64-1.2.0.exe`。当前 SHA 与上一轮交付一致。

### 3.2 展开目录

研究目录是 `C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64`，共 7,136 个普通文件，逻辑大小 1,022,665,550 字节，975.290 MiB。这是 staged application，Native 安装生成的卸载器等不是该目录的一部分。

| 类别 | MiB | 说明 |
| --- | ---: | --- |
| GCC `data/toolchains/ucrt64` | 386.359 | 已经是白名单工具链，3,233 文件 |
| clangd | 62.957 | 314 文件，已删去一部分上游 runtime 载荷 |
| 工具链清单及其余 data | 0.541 | 主要是逐文件 hash manifest |
| Electron 与根部文件 | 314.647 | 包括主程序、图形/媒体库、ICU、许可、两个 locales 等 |
| 内置扩展 | 109.036 | 含共享 extensions/node_modules |
| app 其余内容 | 101.750 | ASAR、unpacked native files、核心 bundle、资源等 |

app 主要项目：`node_modules.asar` 49.193 MiB；`.asar.unpacked` 21.921 MiB；核心 `out` 25.615 MiB。大扩展：Mermaid 40.036 MiB，共享 TypeScript 22.653 MiB，Beacon 12.656 MiB，PDF 10.205 MiB，Markdown language features 8.532 MiB，Code Snap 5.548 MiB。

上述展开体积不能相加推断各类别对 Setup 的压缩贡献：当前采用 solid compression，压缩字典和文件顺序存在跨文件相互作用。

### 3.3 能解释什么，不能解释什么

留存目录 `VSCode-win32-x64-before-beacon-models-20260924` 的 package.json 为 1.2.0、Electron 为 42.6.0；当前为 Electron 43.7.3。两者的 GCC/clangd 版本字符串与体积一致。

| ASAR 内项目 | 留存目录 | 当前目录 | 增量字节 |
| --- | ---: | ---: | ---: |
| 整个 ASAR 文件 | 39,488,855 | 51,583,074 | 12,094,219 |
| node-pty 逻辑叶子总量 | 1,666,100 | 12,296,132 | 10,630,032 |
| node-pty PDB | 0 | 10,633,216 | 10,633,216 |
| 7zip 非目标平台文件 | 11,070,092 | 11,070,092 | 0 |

node-pty 新带入的 PDB 约解释两份 ASAR 文件增量的 87.9%。这是**展开产物间的增长线索**，不能声称已经解释两个 Setup 的增长比例。

旧目录已经运行过，含 WebStorage、CachedData、GPUCache 等约 38.39 MiB 用户数据。因而它的 data 总量和整目录总量不是干净发行基线，不能作为“旧安装包也带缓存”的证据。不能清理这个保留目录或用户缓存来完成本次瘦身。

尝试用现有 7za 只读列举旧 Setup，返回 `Cannot open the file as archive`。未运行旧安装器、未下载解包工具；因此旧 Setup 的精确文件清单及压缩配置尚未建立。未来如需完整历史归因，应在隔离环境安装旧 Setup 或用受控且兼容的只读解析器提取，不能直接运行安装到现有用户目录。

## 4. 已有优化，避免重复计收益

当前已有以下措施：

1. 仅枚举生产 Node 依赖，再通过 `.moduleignore` 清理源文件、测试、示例及部分开发材料。
2. 核心和依赖 source map 已从正式包排除；本次枚举的普通文件和 ASAR 内没有 `.map`。
3. Electron 只保留 en-US 与 zh-CN 两个 locale，总共约 1.085 MiB，不存在“几十种 locale”可再次回收。
4. node-pty、ripgrep 和 OS proxy resolver 已有目标平台过滤。当前 node-pty 没有 foreign prebuild、Debug 或 obj 目录。
5. GCC 已按显式闭包组装；源 GCC ZIP 3,233 文件与 staged GCC 文件数量/字节一致。
6. clangd 已排除 `lib/clang/22/lib/windows`，不能把完整上游 ZIP 与当前包的差值再次计作本轮收益。
7. 工具链源 ZIP 没有同时发进应用，当前是展开工具链；不能靠再删 ZIP 节省。
8. 当前 BeCoder Setup 已使用 `lzma2/ultra64` 和 `SolidCompression=yes`；不能再把“启用 solid / 高压缩”当成尚未实施的主要措施。

来源：`build/gulpfile.vscode.ts` 的资源排除、source map、生产依赖、platform filters 与 ASAR 路径；`build/lib/electronLocales.ts`；`build/lib/becoderToolchain.ts`；`build/win32/becoder.iss:12-13`。

## 5. 候选 A：只调整压缩，不改变安装载荷

这是行为变化面最小的研究路径，但仍需验证安装时间、内存与失败重试，不能只比 EXE 字节。

### 5.1 第一轮实验

冻结同一份 staged application、同一版 Inno、同一个 shortcut helper 文件和 hash、相同安装脚本业务逻辑。用独立输出路径生成候选，不能让现有 Gulp 的 clean task 覆盖基线包。

依次实验，禁止一次同时变多个参数：

- A0：保持原配置，建立可重复的压缩对照；剥离时间戳、签名等不可重复元数据对比较的干扰，但不改变正式签名策略。
- A1：在相同 `lzma2/ultra64` 与 64 MiB 字典下，比较 Inno 官方 `sortfilesbyextension`、`sortfilesbyname` 支持的文件顺序。
- A2：如 A1 收益不足，再研究匹配参数或分组顺序；确认本机 Inno 实际支持，并记录所有解析后的有效值。
- 暂不默认提高字典。若另行尝试 128 MiB，应单独列出安装端内存增加、构建时间和低配机结果；256 MiB 或更高不作为首轮建议。

Inno 官方说明：排序配合 solid 可能提高压缩率；更大字典会增加压缩和解压内存；solid 使随机访问、跳过文件和失败重试的代价增大。当前 64 MiB 字典已有这些取舍，不能为省几百 KiB 无约束加码。

### 5.2 必须证明的等价性

- 最终安装文件的相对路径、字节数、SHA-256、空目录、属性和权限一致。仅看 Setup 大小或 staged hash 不够，需比较实际安装结果。
- Native/Portable 下唯一预期差异仍为原有模式差异；helper、ownership marker、uninstaller、DisplayIcon 和快捷方式均按原规则生成。
- 不改变任务默认、[Run] 时机、提权、覆盖同意、失败处理及卸载日志行为。
- 不引入解压后再二次解包、不引入首次启动生成步骤，不降低校验或签名。
- 记录 Setup 大小、打包峰值内存/耗时、安装峰值内存/耗时、临时磁盘用量和重试行为。

收益以实际同载荷候选 Setup 差值为准，目前没有压缩候选构建，无法给出承诺值。

## 6. 候选 B：7zip-bin 非目标平台文件

### 6.1 当前证据

`package.json:111` 声明生产依赖 `7zip-bin`。当前 ASAR 保留完整平台矩阵：

| 平台载荷 | 字节 |
| --- | ---: |
| Linux 与 macOS | 9,189,004 |
| Windows arm64 与 ia32 | 1,881,088 |
| Windows x64，应保留 | 1,231,360 |

共 10 个非目标平台目录内文件可作为候选（8 个二进制及 2 个 Linux 构建脚本），11,070,092 字节，10.557 MiB。当前 `7zip-bin/index.js:5-22` 按实际 `process.platform/process.arch` 选择路径。Windows x64 应保留 `win/x64/7za.exe`、JS API、package.json、声明及许可；`USE_SYSTEM_7ZA` 原有分支保持不变。

尚未在核心维护源码中找到直接消费者；这不构成删除整个生产依赖的依据。此方案仅过滤 foreign payload，不卸载依赖、不改 API、不移动保留文件的 packed/unpacked 位置。

### 6.2 设计约束

- 过滤发生在构建流、ASAR 生成之前，依据传入的 target platform/arch，不能使用构建主机的 `process.platform` 来决定跨平台产物。
- 策略限定 `node_modules/7zip-bin`，不对所有包作通配平台删除。
- Windows x64 包在 Windows ARM64 的 x64 仿真进程中仍是 `process.arch=x64`，应继续使用 x64 7za；不能按宿主 CPU 错留 arm64、错删 x64。当前 Setup 的 `x64compatible` 接受边界要求将该环境纳入验证；没有机器验证时须明确列为未验证，不能宣称全兼容通过。
- 本轮先保证 win32-x64；对其他已有 target 默认不实施新裁剪，或在完整映射与相应测试成立后才启用。未知目录/新架构先保留并报告，不能静默扩大排除范围。
- 增加打包后断言：目标 exe 非空、PE Machine 为 x64、API 相对路径仍可解析、foreign 文件确实不在 ASAR 内、许可仍在。
- 不更改 Electron ABI、package-lock、用户环境、系统 7za 或工程 node_modules 原文件。

### 6.3 验证

单测覆盖 Windows x64、反斜杠路径、非目标包、target 与 host 不同、未知 target 的保守行为；集成检查实际 ASAR 内容。`path7x` 与其脚本也保持不变。真实运行验证应使用应用自带 Electron/Node 路径，通过现有 API 与调用方式完成受控压缩/解压回环，并在未安装系统 7za、未设置 USE_SYSTEM_7ZA 的环境执行；另外覆盖原有 USE_SYSTEM_7ZA 分支，不能用该分支成功代替 bundled 路径证据。

若追踪得到实际业务消费者，要逐一验证该消费者；如果消费者仍不明确，保留 API 全套文件，不以测试自己构造的新调用方式取代生产消费者检查。

## 7. 候选 C：node-pty PDB 分离，条件推荐

两份文件均在 ASAR 内：

- `node-pty/prebuilds/win32-x64/conpty.pdb`：6,311,936 字节。
- `node-pty/prebuilds/win32-x64/conpty_console_list.pdb`：4,321,280 字节。

总共 10,633,216 字节，10.141 MiB。`lib/utils.js:17-35` 加载 `.node`，Windows agent 另使用 ConPTY DLL/EXE 和 worker；未发现 PDB 位于普通运行加载链。

但是 PDB 是调试符号。移出安装包会改变用户就地进行原生符号调试的便利性；如果“能力保持”包含安装后原地调试条件完全相同，本候选不符合要求，继续保留即可。

若允许符号单独交付，采用以下完整流程，而非直接删除：

1. 在生成候选包前，从同一依赖输入保留符号归档，记录 release commit、包版本、原始路径、文件 SHA-256、Node/Electron ABI 和 target。实际核验 PE CodeView GUID+Age 与 PDB identity；不能按名称猜测 conpty.pdb 属于 conpty.dll，它可能对应 conpty.node。loader 优先 Release/Debug 再到 prebuilds，必须确认最终包真实加载的模块并据此配对。
2. 归档进入稳定可恢复的 release artifact 管理，不依赖开发机 node_modules 或临时缓存；用户需要离线排障时也能取得匹配符号。
3. 实际验证给定发布版本的符号加载/匹配、转储解析与恢复流程，再在打包流中精确过滤这两个路径。后续新出现的 PDB 先审核，不采用全局 `!**/*.pdb` 一刀切。不 strip、重链或替换原生模块。
4. `.node`、`conpty/conpty.dll`、`conpty/OpenConsole.exe`、`lib/worker/conoutSocketWorker.js`、`lib/shared/conout.js`、node-pty package.json 均保持原路径/字节/ASAR unpacked 语义。
5. 正常终端开关、输入输出、调整大小、退出/取消、再次打开、中文文本与多窗口验证必须通过；符号分离不能掩盖 native module 或 worker 的加载失败。

特别注意 node-pty 的 unpacked package.json 有实际作用：防止 CommonJS worker 沿目录查找继承 app 的 `type=module`，否则可能阻塞 pty host。不能把元数据也随手移除。

## 8. 收益估计的证据等级

为判断候选的可压缩性，本轮直接读取 ASAR，分别将两组候选按路径排序，在内存中用 Python LZMA2/XZ、64 MiB 字典、NORMAL/BT4/nice_len=64 压缩，未写文件或生成 Setup。

| 组别 | 原始字节 | 独立 XZ 字节 | 独立 XZ MiB |
| --- | ---: | ---: | ---: |
| 7zip foreign | 11,070,092 | 3,810,596 | 3.634 |
| node-pty PDB | 10,633,216 | 1,116,144 | 1.064 |

它们合计 **20.698 MiB 展开字节**，独立压缩合计 **4.698 MiB**。这只是可压缩性探针，既不是边际收益、也不是上下界：Inno 编码参数、已有 ASAR 顺序、solid 字典和其他文件共享都会改变结果。不能据此交付一个“预计减少 4.7 MiB”的确定承诺，也不能把两项未来 Setup A/B 差值简单相加。

正确测量应为：同输入 baseline → 仅 B → 仅 C（若批准）→ B+C；A 压缩实验再单列。每个结果同时记录字节差、载荷差和运行验收状态。

## 9. 第二期研究项，禁止提前执行

### 9.1 extensions/node_modules/typescript

23,753,387 字节，22.653 MiB。`extensions/package.json:7` 唯一生产依赖为 TypeScript；`build/lib/extensions.ts:484-495` 会收集共享生产依赖。尽管 TS language extension 已从发行扩展集合排除，当前 JSON 扩展 `esbuild.mts:35` 仍 externalize TypeScript。

首轮已扫描当前打包扩展的 JS/CJS/MJS，没有发现字面 require/import TypeScript 的直接命中。第二轮进一步完成 AST 与 JSON server 闭包检查，见第 15 节。当前 external 声明没有实际调用证据，不能将其直接称为 JSON 服务的运行依赖；动态 require、server 子进程、扩展扫描与资源路径仍需运行验证。

进入候选前需要：逐个实际打包 entrypoint 的 external 依赖清单；Node resolver/动态加载追踪；JSON/JSONC 语言服务、schema、设置补全、Markdown 服务及 Notebook renderer 启动测试；明确本包不承诺第三方扩展借用内部共享依赖，同时验证正式扩展安装能力不受影响。不能靠删除整个目录后“能打开编辑器”判定成功。

### 9.2 Mermaid 重复 chunk

Mermaid 总共 41,980,856 字节。Markdown 与 Notebook 的 logos 各 7,312,170 字节、mdi 各 3,172,673 字节，以及其他字节相同 chunk，分别由 manifest 独立入口和动态 import 引用。还有独立 diagram viewer。

SHA 相同只表示内容可重复，不表示任一路径无消费者。跨 webview 共享 chunk 涉及 base URI、localResourceRoots、CSP、Notebook renderer 的资源访问、主题和异步导入，是独立架构变更。solid 已可能压缩重复内容，安装后省多少也不等于下载省多少。本期不动。

### 9.3 扩展测试与小资源

发现 `becoder.setup/test/*.test.ts` 及 notebook-renderers 的少量 out/test JS。确有进一步分离开发文件的空间，但规模很小；应逐个核对 manifest/测试入口后使用所属扩展的打包清单排除，不能全局删除 `test*` 或任意 TS 文件。许多 `.d.ts`、声明资源、语法和 worker 都可能参与真实能力。

### 9.4 重复 native bindings

例如 spdlog、Parcel watcher 存在 bin 与 build/Release 的相同文件。loader 可能具有平台包优先与 Release/Debug fallback，不同库也可能走不同入口。应先查实际解析路线、原生 ABI 和异常 fallback，再考虑小范围排除。当前收益小，不优先承担风险。

## 10. 本期明确保留的能力载荷

| 对象 | 实测或风险 | 结论 |
| --- | --- | --- |
| `stdc++.h.gch` | 146,373,272 字节 / 139.592 MiB；原始 ZIP 内压缩 21,778,308 字节 | 保留。Runner 强制 include bits；健康检查、required list 和 verifier 均要求存在。移除可能回退文本解析、改变编译时延，并非无损清理 |
| GCC C/C++ 前端 | cc1 37.541 MiB、cc1plus 40.120 MiB | C 和 C++ 都是现有能力，保留 |
| CRT、静态/动态标准库、as/ld/collect2 | 被编译/链接/运行真实使用 | 保留，不能以 Hello World 覆盖全部语言行为 |
| GCC target/bin 同名 DLL | 多处复制，依赖进程近邻与私有 PATH | 保留。PE imports 已观察到 intl/iconv/zlib/zstd 与前端数学库闭包 |
| binutils 工具与别名 | 8 个可疑项约 10.47 MiB，ld 与 ld.bfd 同 hash | 暂保留。GCC 子进程、插件、用户显式调用可能使用，未建立不调用证明 |
| Windows/系统/内建头 | 用户源码可 include，存在跨目录引用 | 保留。仓库没有直接引用不代表无用 |
| clangd 主程序与资源头 | 总 62.957 MiB | 保留。intrinsic 与系统头分析是语言服务能力，不按文件名架构随意删 |
| Electron 图形、Vulkan/SwiftShader、ICU、FFmpeg | 浏览器/Webview/字体/媒体与不同 GPU 的运行链 | 保留。不做删除 DLL、UPX、Electron 降级/自编译或运行时裁剪 |
| Beacon syntax worker | 约 8.696 MiB | 保留。打入语言语法、动态高亮 worker，裁语言会改能力 |
| PDF CMap、字体、本地化 | 非 ASCII PDF、嵌入/替代字体和 UI | 保留。能打开一个英文 PDF 不构成完整证明 |
| notices、licenses、recipes、hash manifest | GCC licenses+recipes 原始总计不足 1 MiB | 保留许可/来源/对应源记录和健康检查数据 |

现有 GCC stage 本来没有 OpenMP/sanitizer/Fortran/ObjC 等完整运行库，也没有 lto1/lto-wrapper；不能把不存在的东西计入收益，更不能在报告中悄悄新增“承诺所有 MSYS2 功能”的产品范围。现有支持的 flags、标准选项和明确限制应以当前产品接口为准。

## 11. 实施与回退设计

### 11.1 先建立能够拒绝错误裁剪的清单

从当前干净 staged application 生成机器可读基线：相对路径、类别、字节数、SHA-256、target、来源包版本、ASAR packed/unpacked、模式适用范围。保留空目录和必要元数据；只允许处理普通文件，拒绝不明链接/重解析路径。

删除清单必须逐项列出原因、消费者证据、许可、收益与必跑验证，不能是“所有 docs/test/ts/dll”。每次候选输出整体差异，非批准文件的消失、字节变化、ASAR unpacked 变化、工具链清单变化均使验证失败。对于版本升级新增文件，应报告重新评审，不能静默套用旧假设。

### 11.2 小批次与隔离

1. 不修改现有交付目录及旧包；正常构建会覆盖 staged/output，实验前必须建立独立、可验证的基线与输出安排。
2. 一次仅做 A、B 或 C 中一类，先单项，再组合。
3. 修改源构建规则，不直接从生成目录或 node_modules 手删，以保证下一次干净构建仍产生同样载荷。
4. 不通过 npm 自动清理、去重、升级锁文件或升级 Electron 顺带改变依赖图。
5. 不把用户已有 data、扩展、workspace、`.beaconWork`、`.notebook` 当作发行垃圾。
6. 不默认增加在线下载、首次启动生成 PCH、工具链按需安装、共享系统运行库或硬链接/符号链接，这些都会改变离线/移动/安全/失败恢复契约。

### 11.3 回退

候选未通过时撤回该候选源规则，恢复原完整载荷并重建，保留当前交付包。不得要求用户用“覆盖安装旧包”来无损回退：现有 BeCoder 覆盖安装会明确删除安装内 data，涉及用户数据备份和接受边界。开发候选应只在隔离目录/虚拟机验证，不触碰真实安装。

## 12. 验证矩阵与完成门槛（未来实施，不是本轮通过结果）

| 层次 | 必须证明 | 范围与说明 |
| --- | --- | --- |
| 构建策略单测 | 目标平台保留、foreign 精确排除、未知项保守处理、PDB 仅精确路径、普通包不受影响 | 首批 B/C 的拥有者检查 |
| ASAR 内容检查 | 所有未批准叶子路径/内容保持；保留 unpacked native/worker/package 元数据；没有重新引入 map/foreign | 必须解析 ASAR，不能只枚举磁盘表面 |
| 源检查 | build typecheck、相关 build tests/lint；项目要求的 client typecheck 与 OI extensions compile | 先读 validation-protocol，确认入口，冻结命令与台账；不得把本轮静态读取当验证 |
| staged build | 当前源码成功产出 Windows x64-min | 遵守 AGENTS 的 300 秒 staged build 限时，失败准确记录 |
| package verifier | 现有直接 verifier，`-IncludeCompiler $true`，并增加候选负向与保留断言 | 不能仅改 required list 使错误裁剪通过 |
| 7zip | 目标 loader + 实际调用压缩/解压回环，目标 EXE Machine，离线无系统 7za | 包内运行，不使用开发 node_modules 掩盖缺失 |
| Terminal | 首开/重开、多窗口、输入输出/中文、resize、退出/取消/子进程清理、无 worker 卡死 | B/C 后的重点运行回归，C 另需符号恢复验证 |
| 核心 C/C++ | 当前受支持标准与 flags；bits、PBDS、filesystem/thread、异常、stdio/iostream、UTF-8、本地头、debugger | Runner/Run With Input、CPH、Notebook、diagnostics、clangd 分别验证，不能只测一个入口 |
| 一般编辑/扩展 | 文件监听、搜索、设置、JSON/JSONC、语言补全、VSIX/Open VSX 安装 | 保留普通 IDE 工作流；安装联网测试与核心离线测试分开 |
| 文档/Webview | PDF 中文、Markdown、Mermaid、Notebook、Beacon 高亮与浏览器 | B/C 以烟测为主；若未来触及对应资源，必须扩展到动态资源/字体/CSP/主题全矩阵 |
| Setup | 新建/覆盖/路径拒绝/foreign与junction保护、Native与Portable、默认桌面、公共开始菜单按需UAC/取消/重试、DisplayIcon、卸载/数据边界 | 最终实际 Setup 验证；不得使用旧包结果 |
| 对照与性能 | A 的安装输出逐文件等价；B/C 仅批准项消失；编译/启动/终端响应与安装耗时资源无不可接受退化 | 同硬件/同数据，多次采样，预先约定可接受门槛 |
| 项目所有者验收 | 真实安装、目标机运行与视觉/体验接受 | 需要明确授权 agent-run GUI；自动检查不能替代所有者验收 |

先预检真实存在的脚本和可执行文件，再冻结完整验证命令列表及台账。`verify-becoder-package.ps1` 有工具链精确 inventory 与至少 3233 项的硬编码要求；这不是允许删到 3233 项的证明，也不能为减文件随手放宽门槛。

以下任一情况阻断交付：依赖用途不明且候选仍拟删除、出现清单外差异、需系统工具填补缺失、性能出现未解释回退、两模式 Setup 不一致、符号无法恢复、所有权/数据保护改变、正式检查失败或仅有过期成功结果。

## 13. 待决策事项与建议默认值

| 问题 | 建议默认 | 影响 |
| --- | --- | --- |
| 瘦身优化哪种体积？ | 优先 Setup 下载体积，展开体积单列 | 避免为磁盘上少 140 MiB 承担 PCH 性能损失，却只减少少量下载 |
| 是否有硬性目标大小？ | 没有；安全收益多少交付多少 | 若目标低于安全可达范围，停止并报告，不扩大清理 |
| 首批范围？ | A 压缩实验 + B 7zip foreign，分别验证 | 保持工具链和功能资源不变 |
| PDB 是否必须随安装存在？ | 默认仍随包；可另行批准符号外置 | 普通运行与原生排障是不同接受边界 |
| 是否进入 TypeScript 第二期？ | 先仅继续闭包研究，未证明则保留 | 当前有 external 契约，需要更深消费者验证 |
| 能否以性能/离线性换体积？ | 不接受 | 不删 PCH、不在线下载、不增加首启生成 |
| 测试环境与低配机边界？ | 实施前确定隔离安装环境和最低配置验收机 | A 尤其需要内存/耗时对照；不影响现有安装 |

建议先批准最窄一期的实验与验证方案；不将本调研批准解释为批准所有第二期候选或功能删减。

## 14. 证据索引与官方资料

### 仓库与当前依赖

- `VISION.md`、`AGENTS.md`：用途、离线和数据/构建验收边界。
- `build/win32/becoder.iss:12-15,75-80`：压缩、图标、文件复制与 helper。
- `build/gulpfile.vscode.win32.ts:151-180`：BeCoder Setup 直接消费 staged application、生成 helper 和 Inno 参数；当前 clean task 会覆盖正式输出。
- `build/gulpfile.vscode.ts:147-153,275-285,331-395`：map、生产依赖、filter、ASAR 与 unpacked 闭包。
- `build/lib/asar.ts:13-40,110-151`：打包、unpacked/duplicate 和无内容压缩的拼接实现。
- `build/lib/nodePty.ts:6-14`、`build/lib/test/nodePty.test.ts`：现有 target 平台过滤与反斜杠/跨 target 测试。
- `build/.moduleignore:129-142`：node-pty 源码/build 清理；不覆盖新增 prebuild PDB。
- `node_modules/7zip-bin/index.js:5-22`、`node_modules/node-pty/lib/utils.js:17-35`：当前依赖实际 loader，正式实施前需再次核对版本。
- `build/lib/extensions.ts:182,461-495`、`extensions/package.json:7`、`extensions/json-language-features/esbuild.mts:35`：external 与共享依赖。
- `extensions/mermaid-markdown-features/package.json:180-191`、`esbuild.webview.mts:42-83`、`preview-src/shared/iconPackConfig.ts:7-12`：多个资源入口与动态 chunk。
- `extensions/becoder.beacon/build.mjs:13-49`、`webview/useCodeSyntax.ts:32-39`：语法 worker。
- `build/lib/becoderToolchain.ts:13-94,169-238`、`build/win32/assemble-becoder-ucrt64.ps1:181-236`：工具链白名单、PCH 生成、编译运行探针。
- `extensions/danielpinto8zz6.c-cpp-compile-run/src/compilation.ts:12-91`、`src/compiler.ts:98-102`：实际编译入口、PCH、私有 PATH、参数边界。
- `extensions/llvm-vs-code-extensions.vscode-clangd/src/becoder-toolchain.ts:47-117`、`extensions/becoder.gcc-diagnostics/src/toolchain.ts:28-68`：其他工具链消费者。
- `build/azure-pipelines/win32/verify-becoder-package.ps1:119-125,695-746,881-957`：native worker、ZIP 排除、工具链和许可记录。

### 官方资料（2026-10-19 查阅）

- [Inno Compression](https://jrsoftware.org/ishelp/topic_setup_compression.htm)：方法、内存和线程取舍。
- [Inno LZMADictionarySize](https://jrsoftware.org/ishelp/topic_setup_lzmadictionarysize.htm)：ultra64 默认 65536 KiB；更大字典成本。
- [Inno SolidCompression](https://jrsoftware.org/ishelp/topic_setup_solidcompression.htm)：跨文件压缩、随机访问和失败重试代价。
- [Inno Files flags](https://jrsoftware.org/ishelp/topic_filessection.htm)：sortfilesbyextension、sortfilesbyname、solidbreak 等的真实语义。
- [Electron ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)：virtual filesystem 与原生/外部执行限制；ASAR 不是安装包压缩替代方案。
- [GCC Precompiled Headers](https://gcc.gnu.org/onlinedocs/gcc/Precompiled-Headers.html)：.gch 用途、fallback、编译器/语言/参数一致性约束。
- [Microsoft Debugging with Symbols](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/debugging-with-symbols)：符号用于原生调试，分离必须保留匹配关系。

ASAR 读取使用实际 pickle header：offset 4 的 uint32 为 header 长度，offset 12 为 JSON 长度，JSON 从 16 开始，packed 内容起点为 8+header 长度，再加叶子 offset；unpacked 叶子单独从磁盘计数。重复文件仅对大于 64 KiB 的普通文件做 SHA-256 分类，本轮共观察 24,092,911 字节重复余量，**不是可删清单**，且未包含 ASAR 内部的额外重复分析。

本轮只新增本文作为研究交付；所有实施、正式测试、候选构建、真实安装与 GUI 验收均待后续批准。

## 15. 第二轮深入调查：TypeScript 与 7zip 执行边界

追加日期：2026-10-19。项目所有者要求继续调研，仍未实施清理、构建、依赖重装或应用运行。本节更新证据等级，不改变前文“未知依赖保留”的原则。

### 15.1 TypeScript：从文本搜索推进到 AST 与生产依赖闭包

第二轮使用已安装的 Babel parser，在内存中解析最终包 core out、所有扩展 JS/CJS/MJS、ASAR JS/CJS/MJS，排除正在判断用途的共享 TypeScript 本体。没有执行被分析的包内代码。

| 审计项 | 结果 |
| --- | ---: |
| 文件数 | 3,123 |
| 源字节 | 112,706,418 |
| AST 解析成功 | 3,119 |
| 未解析 | 4 个第三方源码拼接片段 |
| 已识别字面模块说明符 `typescript` / `typescript/*` | 0 |
| `node_modules/typescript`、`typescript/lib`、`_tsc.js`、`tsserverlibrary` 路径字面量 | 0 |

解析区分 import、export-from、dynamic import、require/require.resolve 类调用与普通字符串。唯一含 typescript 的已识别模块说明符是 Beacon 遗留开发配置中的 `typescript-eslint`，不等同于 TypeScript 编译器包。

KaTeX Flow 文件通过 Flow parser 补扫。四个例外位于 Code Snap 第三方依赖的 jquery `src/intro.js` / `src/outro.js` 与 ocrad-bower `pre.js` / `post.js`，它们是拼接片段，不能伪报成“所有文件解析成功”。没有将数千个泛化方法调用候选误报为真实动态 require 数量。

还读取全部当前扩展 manifest：14 个 main、5 个 browser、6 个 Notebook renderer、2 个 Markdown preview script。22 个 desktop 实际文件入口存在且纳入扫描。5 个 browser 指向的文件没有出现在本 Windows desktop 包中，这是既有产物事实；未将浏览器平台或这些缺席入口称为已经验证，也不借此扩展本次修复范围。

### 15.2 JSON server 的疑点已进一步排除

真实链路为：

`json-language-features/package.json main` → `client/dist/node/jsonClientMain` → 客户端按 dist/out 计算 `server/dist/node/jsonServerMain` → IPC 子进程运行最终 server bundle → `vscode-json-languageservice`。

证据包括：

- `client/src/node/jsonClientMain.ts:37-47` 构造 server 模块并配置 IPC；当前客户端 main 确认含 `/dist/`。
- 当前包的 client/server AST 都没有 TypeScript import/require。server 中的 `typescript` 字符串是语言枚举值。
- server 源入口导入 languageserver、request-light、URI、fs、l10n 及本地 server；本地 server 使用 JSON language service。
- server/package.json 不声明 TypeScript 生产依赖。沿实际 dependencies/optionalDependencies 解析，得到 12 个包实例，未缺 manifest，也没有 TypeScript 生产边。
- 实际安装的 `vscode-json-languageservice/package.json` 将 TypeScript 列在 devDependencies；生产依赖为 l10n、jsonc-parser、LSP document/types 与 URI。

所以 `esbuild.mts` 的 `external: ['vscode', 'typescript', 'fs']` 当前是**构建保留配置**。esbuild external 的语义是将已有 import 留待运行解析，不会凭声明新增 import。不能只因配置中有此名字，就断言 JSON 服务依赖它；也不能只因没找到 import，就跳过真实 JSON 功能验收。

### 15.3 为什么仍被装进包：两个独立决策混在一起

`extensions/package.json` 把 TypeScript 声明为共享生产依赖，而 `build/lib/extensions.ts:484-495` 在 desktop 扩展筛选完成后，仍无条件收集共享 production dependencies。这条流不随 html、extension-editing、typescript-language-features 等发行排除项自动收缩。

`extensions/postinstall.mjs:43-45` 的保留注释明确提到 html 和 extension editing；这些旧消费者现在已排除。该脚本还包含 `_tsc.js` 清理规则，但当前安装输入和最终产物仍有 6,239,091 字节的 `_tsc.js`，不能把脚本意图当实际执行证据，不能在本轮运行 postinstall 追补清理。

开发构建对 TypeScript 的需求与发行共享包需求可以分离。根 build 代码仍 import 根 TypeScript，多项扩展脚本仍指向根 `../../node_modules/typescript/bin/tsc6`；因此无需卸载开发 TypeScript、改 lock 或把共享依赖批量移动到 devDependencies 来试探发行用途。

### 15.4 收益探针与新的基线问题

当前共享 TypeScript 是 135 个文件、23,753,387 字节。根层仍保留 LICENSE.txt、package.json、SECURITY.md、ThirdPartyNoticeText.txt。按与第 8 节相同的内存 LZMA2/XZ 参数独立压缩，得到 **2,030,876 字节 / 1.937 MiB**；不是未来 Setup 的实际收益。

同时核实到当前本地 JSON 依赖与源声明存在偏差：

| 依赖 | server/package.json 范围 | 实际本地版本 | semver.satisfies |
| --- | --- | --- | --- |
| vscode-json-languageservice | `^6.0.0-next.4` | `6.0.0-next.2` | false |
| vscode-languageserver | `^10.1.1` | `10.0.0-next.18` | false |

这不是本次清理造成的，也不能单凭版本偏差推断当前最终 bundle 故障。它限制了“当前产物调查可直接代表下一次干净重建”的结论：重装依赖可能改变 bundling 输入、行为和体积，使瘦身实验混入版本变化。

因此在实施前增加门槛：记录最终包与实际构建依赖的版本、hash 和解析位置；分别标明 manifest/lock 期望与当前实际输入。若无法建立受控且可重建的对照，应先在独立依赖一致性事项中解决，重新验证完整基线，再开始瘦身 A/B。不在瘦身中执行 npm ci、npm update、postinstall 或任意 node_modules 修补以“顺便修好”。

### 15.5 TypeScript 结论与最小候选设计

状态提升为：**已完成较强静态闭包调查，没有发现当前正式入口的明确运行消费者；运行与资源访问证据仍不足，继续保留。**

静态分析尚不能穷尽 minified require 别名、computed property、拼接字符串、eval、fs 数据读取和未来第三方扩展。当前扩展 host 仍通过 manifest 计算模块 URI，再执行通用 import/require；`src/vs/amdX.ts:210-234` 也支持动态 moduleName。`src/bootstrap-node.ts:65-125` 维护 app ASAR 查找，`extHostRequireInterceptor.ts` 维护内部模块别名，未发现它们专门注入共享 TypeScript；这仍不是任意动态参数取值的形式证明。

若后续授权进入 TypeScript 独立实验，最小源码候选仅限 OI desktop 的共享依赖发行流，精准定位 `extensions/node_modules/typescript`。不改开发安装、不卸载依赖、不改 lock、不全局排除所有 typescript 目录，不删除第三方扩展自带的 TypeScript，不默认删除整个 extensions/node_modules，不顺带移除 JSON external 防御配置。

批准该候选前还需要：

1. 在隔离基线中跟踪 CJS、ESM、子进程和目标目录文件读取；覆盖 JSON/JSONC settings、schema 引用与更新、补全、诊断、格式化、排序、Markdown/Notebook 入口、安装并激活实际允许的扩展。跟踪资料只保留模块/资源路径及必要结果，不记录用户项目内容或凭据。
2. 在独立候选目录不包含这份共享 TS 的条件下重复功能用例，禁止通过系统 Node、根 node_modules、NODE_PATH 或另一个 SDK 回填，确认所用 Electron、cwd、profile 与 resolver 来源。
3. 任一正式消费者触及该路径，候选立即阻断，不用 catch、shim、在线下载或全局 TypeScript 隐藏缺失。
4. 建立产物入口/已识别 external 依赖断言，未来内置扩展重新引入共享 TS 消费时使打包检查失败并要求重新评审。动态依赖不能靠一个 AST 断言全部解决，仍需维护运行用例。
5. 如果产品要求连“第三方扩展显式读取这份私有 TypeScript 文件”的行为也完全保持，整个目录就不能移除；需要保留，而不是用有限测试宣称兼容所有扩展。

### 15.6 7zip：执行位置与消费者证据补齐

第二轮直接读取最终 ASAR 2,409 个文件条目及 payload。7zip-bin 的 15 个普通文件叶子全部 packed，没有 unpacked 标志，unpacked 树没有对应 7zip-bin；其中 10 个非目标平台目录内文件为候选，5 个公共/目标文件保持（index.js、package.json、LICENSE.txt、7x.sh、win/x64/7za.exe）。

在 ASAR 的依赖代码及最终 out/extensions/unpacked 的 JS/MJS/CJS/JSON/SH/CMD/PS1 中，`7zip-bin`、`path7za`、`path7x`、`USE_SYSTEM_7ZA` 的命中仅为包自身 API/manifest 或内嵌根 package 依赖声明，没有发现当前内置消费者调用。锁文件中也未发现其他包依赖该包的边。这是明确引用审计，不覆盖计算字符串、外部插件或按私有绝对路径访问。

`win/x64/7za.exe` 的 PE Machine 为 `0x8664`，源文件与当前 ASAR 中对应文件 SHA-256 均为：

`b0cfdeaf429f5cc53f85123dd8f5a5feb92c19d31aa34df257edf9a26be05f95`

当前布局并不自动证明 7za 不可执行。Electron 对 `execFile` / `execFileSync` 可进行 ASAR 临时提取；直接 spawn/exec 不具有相同的 ASAR 内执行支持。因此：

- 仅裁剪 foreign 目录，x64 EXE 及所有公共入口/脚本/许可的路径、字节和 packed 状态不变。
- 保留 `path7x`、7x.sh、USE_SYSTEM_7ZA 及脚本原有 SZA_* 环境分支。不因 Windows 当前不走脚本就顺手删除。
- 不能为瘦身顺便 unpack 整个包、修改消费者 API 或解决潜在既存 spawn 问题；这些会扩大变化面。
- 实施验证必须由真正的打包 Electron 通过原 loader 返回的包内路径执行受控回环；系统 Node 或磁盘源码下的成功不能证明 ASAR 成立。
- 如未来发现真实消费者，按其原 API 再验证；保留 x64 仿真架构边界，不能以宿主 CPU 决定保留目录。

### 15.7 第二轮后的推荐顺序

1. 先冻结依赖与当前交付基线，解决实验可比较性。
2. 首期仍为同载荷压缩实验、7zip foreign 精准过滤，分别评估后再组合。
3. TypeScript 进入独立运行验证候选；无充分证据继续保留。不是扩大首期默认删除范围。
4. PDB 保持随包；只有明确接受符号交付方式变化时才开启对应事项。
5. 不碰工具链、PCH、Electron、多入口资源和许可材料；不设强制减重目标。

补充官方资料：[esbuild external](https://esbuild.github.io/api/#external)、[Node CommonJS 查找路径](https://nodejs.org/api/modules.html#loading-from-node_modules-folders)、[Electron ASAR 的额外提取与可执行限制](https://www.electronjs.org/docs/latest/tutorial/asar-archives)。所有运行与候选构建仍为待执行事项，本节没有新增通过声明。

## 16. 第三轮：运行探针、基线归因与最终决策

本节是本次调研最终结论。研究已达到能够明确首期范围、阻断项和正式验收条件的程度，不再为追求“可删更多”继续扩大范围。剩余工作需要修改构建规则、重建基线或运行完整工作台，属于实施/验收，不能由更多静态搜索替代。

机器可读的精确清单与摘要见 [becoder-setup-size-evidence.json](2026-10-19-becoder-setup-size-evidence.json)。完整临时过程证据保存在仓库 `tmp/becoder-size-research/`，未加入产品代码或发行包。

### 16.1 临时研究 ASAR 的真实 7zip 回环

从原 ASAR 构造专用临时研究 ASAR，只移除第 6 节的 10 个路径。没有改写原 ASAR、staged application 或现有 Setup。它不是完整应用：没有为其复制整个 unpacked 树，也没有用它代替正式打包产物。

| 检查 | 结果 |
| --- | --- |
| 原 ASAR | 51,583,074 字节，SHA256 `0bb7b9f61714889aa2b5603e0de473848a3c445564565c96649583122a508e54` |
| 研究 ASAR | 40,512,350 字节，SHA256 `501e0478679a158a01ea8c56f241597b74916024e9c4cad8571f3a3599df381b` |
| 精确差异 | 仅删除指定 10 项，没有新增文件 |
| 保留项 | 2,352 个 packed 文件 payload/hash 不变；47 个 unpacked 叶子元数据不变；仅 packed offset 重定位 |
| 原包保护 | 研究前后原 ASAR hash 相同 |
| 原始体积收益 | ASAR 少 11,070,724 字节，其中 payload 11,070,092，header 632 |
| 运行环境 | 实际 BeCoder.exe，Electron 43.7.3 / Node 24.21.0 / ABI 148 / win32-x64 |
| helper 来源 | 分别 require 各自 ASAR 内的 7zip-bin/index.js，再 execFile 其导出的 path7za |
| 7z / zip | 两组都完成中文文件名、UTF-8 内容的压缩/解压，结果逐字节一致 |
| 其他 API | path7x 存在；USE_SYSTEM_7ZA=true 返回原有 `7za` 字符串，但不执行系统程序 |
| 退出 | baseline/candidate 均 code 0、stderr 空，45 秒 watchdog 未触发 |

每个子进程均 ELECTRON_RUN_AS_NODE=1、隐藏窗口、独立 cwd/TEMP/TMP，清除 NODE_PATH/NODE_OPTIONS/USE_SYSTEM_7ZA；只写自身研究目录。未调用应用 bootstrap、未打开编辑器或安装器。

**可以确认：该精确清单在当前 Windows x64 的 ASAR API 与 execFile 回环中保持工作。** 不能扩大为完整应用、任意业务消费者、Windows ARM64 仿真或 Setup 已验证。正式实施必须由真实构建规则重新产出包，再复核差异与同一回环，不能直接交付临时研究 ASAR。

### 16.2 同压缩器、整 ASAR 的收益模型

前轮只单独压缩 foreign 载荷；本轮对完整 baseline/candidate ASAR 分别做同参数内存 XZ/LZMA2 压缩，64 MiB 字典、NORMAL/BT4/nice_len=64，串行执行，未保存压缩归档。

| 输入 | 独立 XZ 字节 | 本机单次耗时 |
| --- | ---: | ---: |
| 原 ASAR | 9,753,624 | 10.303 秒 |
| 研究 ASAR | 5,966,172 | 7.348 秒 |
| 模型差值 | **3,787,452，约 3.612 MiB** | 不作为性能结论 |

该模型补强“可能是数 MiB 级下载收益，而非 10 MiB”的判断；它仍不包括 Inno solid 跨文件字典、文件顺序、过滤、外壳、签名和安装过程，不能拿 3.612 MiB 作为 Setup 的承诺值或上下界。当前没有新 Setup，也没有真实 Setup A/B 收益结果。

### 16.3 当前 JSON server 的 TypeScript 访问拒绝对照

直接由真实 BeCoder.exe 在 Electron-as-Node 模式执行最终包 `server/dist/node/jsonServerMain.js`，通过 stdio LSP 驱动。目标文件 377,271 字节，SHA256 为 `12707daba723881bffecd666ce22ccb4e35dd17424d4c4db42d894001a668695`。

在专用 tmp 中运行两组：observe 记录指定接口；deny 同时拒绝 TypeScript 模块解析和指定 fs 路径操作。Node options、NODE_PATH、开发/本地化覆盖清除，PATH 限定 System32；schema 通过受控 LSP callback 提供，不使用用户工程或线上 schema。

- 先做正向控制，确认 ESM import（bare 与 absolute）、CJS require、require.resolve 均触发拒绝，共 4 次模块拦截；string/Buffer readFileSync 与 promises readFile 共 3 次文件拒绝；Socket.connect 和 http.request 共 2 次网络拒绝。没有真正读取/执行 TypeScript，也没有向网络发请求。
- 两组均完成初始化、schema 错误诊断、schema 属性补全、hover、格式化、文档符号、折叠、selection、排序、JSONC 注释/尾逗号规则、didChange 后诊断、languageStatus、schema 失效重新获取。
- 比较保存的 13 组返回（含初始化），两组一致。错误 fixture 有 3 条诊断、补全有 3 个属性；schema 更新后重新取回并产生预期诊断。两组都正常 shutdown/exit，code 0、stderr 空；记录到的 TypeScript 模块/路径访问均为 0，受监测网络调用为 0。
- 第一次和第二次尝试因临时客户端错误处理按位置参数 `[schemaURI]`，未满足诊断断言。失败结果已保留，归类为研究编排错误。修正客户端后第三次通过；独立审阅发现 Buffer/正向控制覆盖和协议异常清理边界，随后加固并再次完整通过。没有为通过探针修改产品。

监测不是 OS 沙箱：标准 JS module/fs 与网络 API 的覆盖不等同于所有 native/internal 通道的形式证明。它只支持**该指纹的 packaged JSON server 在所列受控请求中，没有发现外部 TypeScript 需求**，不覆盖整个 JSON client、settings UI、其他全部扩展或未来重建结果。共享 TS 仍保留。

### 16.4 依赖漂移已有完整归因链

“client 项目”在此指 `extensions/json-language-features/` 根项目（不是其 client 子目录）；server 是其独立的 `server/` npm 项目。

| 项目/依赖 | 当前受跟踪 lock | 实际安装 |
| --- | --- | --- |
| server / vscode-json-languageservice | 6.0.0-next.4 | 6.0.0-next.2 |
| server / vscode-languageserver | 10.1.1 | 10.0.0-next.18 |
| client / vscode-languageclient | 10.1.1 | 10.0.0-next.22 |
| 两边 / vscode-jsonrpc | 9.0.2 | 9.0.0-next.12 |
| 两边 / vscode-languageserver-protocol | 3.18.3 | 3.17.6-next.18 |

当前源 manifest 与 tracked lock 一致。`5077410e9553c8ec82111b381719dfa7af957bef`（2026-10-05）同步升级了两个项目的 manifest/lock；两个 node_modules 隐藏 lock 的生产版本，分别与该提交前的 tracked lock 21/21、11/11 相同。支持“旧安装树没有跟随源声明升级”的判断，但没有安装日志，不能断言当时原因。

进一步的代码指纹：

- 最终 client bundle 662,303 字节，SHA256 `a9c4a6c90ffd5e1cfb36d943b31f3e96eff697299d5d578993bd3e616614452c`；server 同上。最终两文件与本地对应 dist 文件逐字节相同。
- 本地 server map 中 languageserver 24/24、JSON-RPC 16/16、protocol 29/29、language service 23/23 个 sourcesContent 与旧安装源匹配；client map 的 languageclient 57/57、JSON-RPC 16/16、protocol 28/28、LSP types 1/1 匹配。
- 漂移不是只影响两个版本号：client tracked lock 的 21 个生产包实例中 8 个版本与安装树不同；server 当前 lock 要求 10 个实例，旧树有 11 个，共同路径 7 个版本不同，还有嵌套路径变化。
- .postinstall-state 保存的相关 4 个 manifest/lock hash 已不匹配当前输入，正常 skip 条件目前不能成立；不能将历史原因归咎于 skip 逻辑缺陷。
- 共享 TypeScript 6.0.3 与根开发 TypeScript alias 6.0.2 各自匹配对应 lock。JSON 漂移不等于 TypeScript 自身版本漂移。

依赖一致性需要独立处理：保留现有交付证据，在隔离环境按两个现有 lock 恢复输入并单独验证 JSON，建立新的受控基线，再重新审计 TS。不得把根 npm ci、多项目升级、降级 tracked lock 或 node_modules 手补混入瘦身。若暂不纠偏，只能称“基于当前已记录实际输入”的研究，不能声称验证了按当前 lock 的可复现正式构建。

### 16.5 Inno 工具版本与默认参数已核实

本地 innosetup npm manifest、whatsnew、当前交付构建日志 `tmp/becoder-shortcuts/icon-setup-build.log:22` 一致指向 **Inno Setup 6.4.1**；ISCC /? 的只读输出确认 6 系列。Windows 文件版本字段为 0.0.0.0，未将该字段作为版本证据。Setup data 的 6.4.0.1 字串是格式标记，不能当编译器版本。

- ISCC.exe SHA256：`3A34C0BEAF8C9C66774C1C1286A504DB403E97E1B2FBA691B3BA865DBCE7EDB2`。
- ISCmplr.dll SHA256：`C4DEDF1B3CD7126F34FA0E131C7E41C3157548DF9A1E7E997E793C836EBF0AFD`。

按 [6.4.1 固定 tag 的官方帮助源码](https://raw.githubusercontent.com/jrsoftware/issrc/is-6_4_1/ISHelp/isetup.xml) 核对：当前 ultra64 默认字典 65536 KiB，算法 1、BT、fast bytes 64、block threads 1、CompressionThreads auto；blocksize 只在 block threads≥2 时起作用。脚本没有覆盖这些参数。当前已经采用高压缩与 solid，不存在“打开原来没开的高级压缩”这一已知收益。

未获得可靠的真实 solid 流解析结果，未猜测块边界或最终收益。推荐保留现配置，先做已证明范围更窄的 foreign 文件过滤。

### 16.6 最终分级、实施顺序与调研停止条件

| 对象 | 最终状态 | 后续动作 |
| --- | --- | --- |
| 7zip foreign 10 项 | 足够进入首期实施设计，研究 ASAR 当前 x64 回环通过 | 只改目标发行过滤；生产构建后重做全量差异、helper 回环、package/Setup 与运行验收 |
| 压缩调优 | 没有改参数的实际收益证据 | 首期保持原样；未来同载荷实验单独批准 |
| TypeScript 共享目录 | 当前静态及特定 server 运行证据较强，但新 lock/完整工作台未验证 | 保留；先独立处理依赖基线，再验证候选，不与首期混做 |
| node-pty PDB | 正常运行不依赖，但诊断能力交付方式会变 | 按严格保持要求，保留 |
| GCC/PCH/clangd/Electron/功能资源/许可 | 有消费者或存在不可排除能力影响 | 不清理，不继续为压体积扩展研究 |

进入正式实施前，先冻结当前 Setup/staged/实际依赖与 source/lock 快照，明确依赖一致性事项的独立处理方式。任何新基线产生后，旧探针只作历史证据，必须针对新输入重跑。

正式实施的最小改动落点仍是生产依赖打包流、ASAR 生成之前；限定 Windows x64 的 7zip-bin 精确路径。target/host 分离、反斜杠路径、未知 target 保守处理、保留文件 hash、ASAR packed/unpacked 状态及升级新增文件复审均需成为检查项。禁止整包卸载或全局平台清理。

最终发布仍需当前源码检查、staged build、直接 package verifier、新 Setup 构建与直接验证，再交项目所有者验收。Windows ARM64 x64 仿真尚无实际设备验证；不能写成已通过，也不能悄悄缩小原 x64compatible 边界。完整业务和 GUI 验收不由这些无界面探针替代。

至此调研已足够作出保守的首期决定；尚未执行的是明确的实施/验收门槛，不再以“继续搜没引用”代替它们。本次没有清理产品文件、改依赖、改构建规则或生成新 Setup，当前交付 hash 不变。
