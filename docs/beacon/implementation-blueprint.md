# Beacon 首版工程蓝图：先接通工作区与上下文底座

日期：2026-10-12 · 状态：设计与实施连接导航；当前本地源码和验证另见[实现状态](implementation-status.md)，未获完整产品运行验收

需求依据为[正式 PRD](prd.md)、[架构基线](architecture.md)、[Notebook 设计](notebook.md)及负责人最新直接决定。T1–T5 的方案与证据分别见[上下文工具](context-tools-research.md)、[证据链](context-record-design.md)、[Notebook](notebook-technical-design.md)、[四平台 OJ](oj-technical-design.md)、[压缩与记忆](memory-quality-technical-design.md)。本文件落实模块归属、连接接口和开发先后，不重新讨论产品范围，也不是启动实施的命令。

## 1. 要先解决的问题

学生在 V1 上运行出错，随后把代码改成未保存的 V2，再问 Beacon。基础设施应已记录 V1 的执行证据，同时能提供当前打开页面的 V2；Beacon 向模型说明两者的身份、缺失情况和读取入口，让它按需判断。聊天未打开、模型未配置时，用户运行仍应形成合法范围内的记录。

因此推荐：**BeCoder 原生服务管理窗口工作区、存储与跨窗口协调；实际执行模块生产事实；Beacon 组织模型输入和受控工具。** 只增加这些职责所需的窄接口，继续使用 Code-OSS、现有执行器和 AI SDK。低价值运行产物用朴素文件 FIFO；笔记、会话和记忆沿各自资产规则保存。

主模型记忆采用简单追加 tips/status，用户查看、编辑把关；不引入自主去重、改写、质量评分器或维护代理。Notebook 四条完整流程、四平台 OJ 和主动 dream 都在完整首版中，以下依赖顺序不是延期范围。

## 2. 本轮核对的源码事实（F）

本地源码固定于 `865c504d0795d7b64dc413756916e17ee36696c5`，分支 `codex/BeCoder_Next`；当前变动为研究及正式文档，不能当成已实现能力。下表链接指向本地路径，函数名用于定位；实际实施前仍须核对 HEAD 和源码差异。

| ID | 固定源码入口 | 已有能力与具体差距 |
| --- | --- | --- |
| E01 | [窗口状态](../../src/vs/platform/windows/electron-main/windowsStateHandler.ts)，`toWindowState`、`restoreWindowState`、`serializeWindowState` | 窗口状态已有完整保存/恢复路径；明确序列化编辑器 workspace/folder、backup 和 UI 状态，未保存独立 Beacon 根或稳定窗口 slot。几何恢复可复用最后活动窗口状态，不能顺带继承其 Beacon 根。 |
| E02 | [窗口创建/恢复](../../src/vs/platform/windows/electron-main/windowsMainService.ts)，`doGetPathsFromLastSession`、`openInBrowserWindow`；[配置类型](../../src/vs/platform/window/common/window.ts) | 恢复状态先转为待打开路径，再进入新建/复用窗口配置。只加一个类型字段不会自动贯通恢复；复用窗口加载另一编辑器根时也要保留其 Beacon 选择。 |
| E03 | [服务与 IPC 注册](../../src/vs/code/electron-main/app.ts)，`registerServices`、`initChannels`；[浏览器窗口端](../../src/vs/workbench/contrib/browserView/electron-browser/browserViewWorkbenchService.ts) | 原生服务、窗口端代理已有范式。窗口端持有真实 `mainWindow.vscodeWindowId`；Beacon 桥应由宿主绑定它，不能让模型传入任意窗口 ID。 |
| E04 | [命令桥](../../src/vs/workbench/api/browser/mainThreadCommands.ts)，`$executeCommand`；[原生贡献示例](../../src/vs/workbench/contrib/becoder/browser/beCoderNewTab.contribution.ts) | 内置扩展能调用窗口内命令，适合传窄 DTO；现有命令入口不附带逐调用扩展身份，下划线命令名不是授权机制。工具集合、参数验证与宿主归属仍需显式实现。 |
| E05 | [Runner API](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/extension.ts)，`RunnerCompilerApi`；[真实入口](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/compile-run-manager.ts)，`executeRun`；[执行器](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/runnerProcess.ts)，`execute`、`runChild`、`runPty` | 现有对外 API 只准备编译计划；计划不证明发生执行。真实输入、编译启动、流和退出须在执行器接出。PTY 是混合终端流，成功转发输入不证明程序消费了同样的 stdin。 |
| E06 | [CPH 导出](../../extensions/becoder.cph/src/extension.ts)；[视图连接](../../extensions/becoder.cph/src/judgeView.ts)；[执行](../../extensions/becoder.cph/src/execution.ts)，`judge`、`runProcess` | 对外只有题目导入事件。CPH 已消费 Runner 编译计划并有逐样例结果；`onCompileStarted` 位于真正 spawn 之前，不能直接当编译器已运行。私有目录在 finally 清理，有用材料必须先捕获。 |
| E07 | [源码保存](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/compiler.ts)，`prepareActiveSource`；[诊断镜像](../../extensions/becoder.gcc-diagnostics/src/compilerRunner.ts)，`run`、`diagnosticArguments` | Runner/CPH 目前让 GCC 读取原路径，保存后仍有变更窗口。诊断模块已用同名临时镜像、原目录 cwd、`-iquote` 和路径宏映射；仅语法检查，不证明完整编译运行等价。 |
| E08 | [编辑器服务](../../src/vs/workbench/services/editor/common/editorService.ts)，`editors`、`getEditors`；[标签桥](../../src/vs/workbench/api/browser/mainThreadEditorTabs.ts) | 可枚举本窗口当前打开的活跃/非活跃标签，不限当前可见页。枚举入口不等于读到了内容；正文必须来自对应已存在的页面模型，不能 resolve 到磁盘补读。 |
| E09 | [浏览器主服务](../../src/vs/platform/browserView/electron-main/browserViewMainService.ts)，`getBrowserViews`、`parseProblem` | 已有 owner window、隔离世界解析和导航/关闭复核。view 存活不等于标签仍为用户打开状态；当前页适配器需同时核对编辑器标签和 view。题面解析不等于通用页面/本人判题读取已实现。 |
| E10 | [Beacon 入口](../../extensions/becoder.beacon/src/extension.ts)、`historyStore.ts`（调研时源码，现已按负责人要求删除）、[模型调用](../../extensions/becoder.beacon/src/provider.ts) | 现用编辑器根、全局 `history.json`、只读文件工具和完整历史重放。历史已有变更合并、冲突拒绝及临时写/rename，不应称为完全无并发处理；仍缺独立根、单对话占用、会话材料 owner 和三档新资格。 |
| E11 | [CPH 工作区占用](../../extensions/becoder.cph/src/workspaceLease.ts)，`acquireWorkspaceLease` | 已有 Windows 命名管道，进程结束由 OS 释放。借鉴机制，分别为短期资源写入和长期单对话打开设不同 key，不能复制成整个 Beacon 工作区长期锁。 |

许可证按文件归属处理：Code-OSS 上游入口及 Runner/诊断所读文件保留 Microsoft MIT 头；BeCoder 原生贡献和 CPH 的新增/修改归属遵循其 GPL-3.0-or-later 头；Beacon 扩展当前为 MIT。跨模块只传 DTO，不能把某个目录的许可证推断为全仓统一许可证。实施时保留原头，并检查新增文件所属区域的两个邻近文件。

## 3. 三种模块归属方案（D）

| 方案 | 能解决什么 | 代价与结论 |
| --- | --- | --- |
| 全放 Beacon 扩展 | 改动集中，复用现有聊天代码 | 记录生命周期受聊天扩展激活影响；原生窗口恢复、浏览器和跨窗口占用仍要补桥，容易让聊天 owner 管所有事实。适合当前原型，不适合确认的首版边界。 |
| 新增独立上下文扩展 | 可通过激活机制提前记录，拆开聊天与采集 | 仍需原生恢复/页面能力；又多一套扩展激活、依赖和打包关系。原生能力最终仍不能省，收益不足以覆盖新增层次。 |
| 原生协调 + 扩展事实生产者 + Beacon 消费者 | 即使聊天不打开也工作；同根多窗口集中协调；复用原生页面与保存生命周期 | 增加一组原生服务/窗口桥，但不重写 Runner/CPH 或模型框架。**推荐此方案。** |

命令桥是 BeCoder 内置组件的传输手段，不是通用插件沙箱。模型只获得专门的材料/学习资产工具，不获得 executeCommand、任意 JavaScript、Shell 或 run/stop/submit。宿主核验根、窗口、会话、档位和真实资源；联网个人信息的用户许可依最新决定采用 prompt 软约束，不另建许可凭据或审批门。

T1 中跨扩展 typed API 的经验继续用于传递窄契约；本蓝图把共享记录读取 owner 收敛到原生协调服务，不再让 Beacon 分别追读每个执行扩展的可变状态。现有 Runner 编译计划 API 保留供 CPH/Notebook 的用户执行使用。

## 4. 候选模块与文件归属（D）

下面的新路径是候选实施路径，当前均未创建。普通命名可在实施时依本地约定调整，职责和接口不得因路径调整散失。

| 模块 | 候选新增路径 | 修改入口与责任 |
| --- | --- | --- |
| 公共契约 | `src/vs/platform/beacon/common/beaconContext.ts` | 定义可序列化 DTO、结果、记录来源和 IPC channel 名；无 UI、GCC、Notebook 或模型 SDK 依赖。 |
| 文件存储 | `src/vs/platform/beacon/node/beaconStore.ts`；`beaconLease.ts` | 自有目录校验、文件 FIFO、会话材料复制、短资源写占用及对话占用；借鉴 E10/E11，资产完整写入与可丢缓存分开。 |
| 主进程协调 | `src/vs/platform/beacon/electron-main/beaconContextMainService.ts` | E03 注册；管理窗口 slot/root/epoch、最近根、实际任务句柄、会话打开 owner、根失效和生命周期释放。文件 store 不依赖工作台模块。 |
| 窗口恢复 | 无额外独立系统 | 修改 E01/E02 三个文件，贯通 slot 与选定根；更新 state 捕获、序列化、反序列化、恢复路径传递和配置。不得改成 editor workspaceState。 |
| 窗口服务与页面 | `src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts`；`beaconPages.ts` | 桥在窗口命令注册阶段就可用，不等聊天视图；恢复根的检查可后台进行，首次操作等待检查结果。页面只消费本窗口已打开的原生模型/已加载网页，异步复核版本、导航、关闭。按原有 desktop contribution 路径接入。 |
| Runner/CPH 适配 | 各扩展 `src/beaconEvidence.ts` | 改 E05/E06 的实际执行点，不观察整段 UI/终端文本猜执行状态；执行器收到窄 evidence sink，未选择根时 sink 为空，原用户操作照常。 |
| Beacon 消费 | `extensions/becoder.beacon/src/context.ts`、`contextTools.ts` | 修改 E10，以及 `connections.ts`、`workspaceFiles.ts` 和 webview 的设置/权限/历史显示；改用宿主 context，保留连接/BYOK/流式处理。文件工具与页面/记录工具不互相兜底。 |

初始 `beaconPages.ts` 支持文本及内置浏览器，Notebook/PDF 适配随其 owner 接入。页面 provider 需要能读取实际页面内容，包括图片/公式等模型支持的材料；只有标签 URL、文件路径或空串不能算实现三档页面读权。未知页面类型返回明确的不可读原因，不静默从 backing file 补读；完整首版验收仍包含其已承诺的页面场景。

### 4.1 窗口恢复不能漏的路径

新窗口创建新 `windowSlotId`；真正恢复的窗口承接自身 slot 和根；已有窗口 reload 或改变编辑器文件夹保留自己的 slot。恢复传递从 E01 的保存对象经 E02 的待打开路径与 options 进入 `INativeWindowConfiguration`，不是按编辑器路径查一个全局根。最后活动窗口的几何 fallback 只恢复几何，不能复制 Beacon 元数据。当前运行的 windowId 只作路由。

同根多窗口共享文件 store，不共享当前会话。busy 来自实际的相关执行、回答、生成和必要落盘句柄，结束/失败有确定释放点；模型不能自行宣布窗口空闲。相关运行开始时冻结根，根切换按 PRD 拒绝，不把尾部事件写到另一根。根失效保留选择、停止新持久化操作并反馈；不创建替代目录，普通用户运行继续。

### 4.2 最小连接契约

以下为候选签名，非可直接复制的完整类型定义。所有方法由窗口桥闭包绑定真实窗口；消费方法再绑定当前会话和合法权限。模型参数不得携带 root/window/其他 conversation 来替换这个绑定。

| 接口 | 输入与输出 | 所有者和关键语义 |
| --- | --- | --- |
| `getContext()` | 返回 slot、root 选择/可用性、epoch、合法档位、当前会话和轻量材料入口 | 主进程协调 + 窗口页面 provider；入口元数据不预读代码全文。 |
| `selectWorkspace(path)` / `setMode(mode)` | 返回新 context 或可解释的拒绝原因 | 用户 UI 入口；建立/核对合法 `.beaconWork`，busy 拒绝、失效保留选择，工具不能自动改根/提权。 |
| `prepareEvidence(request)` | producer、requestId、真正执行对象身份/捕获内容；返回 host handle 或 `not-recorded(reason)` | 生产者专用，宿主验证对象确实在本窗口所选根内；Notebook 看笔记自身，不能看关联源码替代归属。暂存不占 FIFO。 |
| `compileAttemptStarted(handle, plan)` | 真实进入编译启动流程的计划/时点，返回记录身份或失败 | 捕获并绑定代码后，紧贴真实 spawn 调用；与随后 `spawned/start-error` 分开，不以 UI 回调或收到编译计划代替。requestId 幂等。 |
| `appendEvidence(handle, sequence, event)` / `finishEvidence(handle, outcome)` | 实际 input、流、样例、退出/取消与覆盖信息；返回接收/持久化结果 | producer 产生事件与序号；宿主批量落盘，不逐字符等磁盘。结束先排空已接收批次，报告保存结果，再释放相关 busy；错误也必须释放。 |
| `openConversation(id)` / `releaseConversation(handle)` | 返回本窗口独占句柄，或“此对话已在其他窗口打开” | 宿主在真正打开前取得占用，归档也同样；关闭、切换、窗口/扩展断连释放，不提供跨窗口切换。 |
| `listMaterials(kind, query)` / `readMaterial(id, range)` | 页面/记录/本会话材料入口和内容；返回来源、版本、覆盖、缺失与补读入口 | 宿主每次查合法范围；blackout 只开放主动材料和当前页。缓存详情先固定 revision 并保存本会话副本，再交模型；blackout 用内存副本。 |

`readMaterial` 的页面分支只能调用页面 provider，文件分支另走文件授权；关闭页面返回 `page-closed`，不能改走文件工具。记录、文件、页面、Notebook 结果和 OJ 查询是不同 operation；可以共享外层结果形状，不能用一个任意路径入口抹平权限。当前对话自己的材料回读也必须核对 conversation owner。

反馈用稳定原因码配人可理解的解释，例如根不可用、页面变化、记录已淘汰、部分输出、材料保存失败。模型可以据此补读或说明缺失；不因普通材料缺失追加审查模型、反复许可确认或自主执行。

## 5. 先验证“记录的代码就是编译的代码”（D/H）

E07 已证明现有保存不是不可变输入。候选优先复用诊断模块的请求私有同名镜像：执行者捕获一次主代码，把同一份 bytes 交记录和编译；临时执行目录与 `.beaconWork` 缓存分开，FIFO 淘汰不能清理仍在使用的源码/程序。保留原用户执行时的保存、编译配置、PCH/debugger、发布和取消策略。

GCC 官方说明：`__FILE__` 取决于预处理器打开的路径；`-fmacro-prefix-map` 可以映射路径宏，但包含查找还会先查当前输入文件所在目录，`-iquote` 有其特定顺序。因此“换 cwd + 加两个参数”不能直接当成等价证明。见 [路径宏](https://gcc.gnu.org/onlinedocs/cpp/Standard-Predefined-Macros.html)、[宏映射](https://gcc.gnu.org/onlinedocs/gcc/Preprocessor-Options.html)、[目录查找](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html)，2026-10-12 查阅；这些实时手册不冒充随仓库 GCC 固定版本的运行证据。

| 输入绑定路线 | 判断 |
| --- | --- |
| 保存后复制原文件，继续编译原路径 | 改动少，但 hash/mtime 的前后检查仍不能证明 GCC 读到相同 bytes。只能标“编译前捕获”，不能满足已确认的当次主代码绑定。 |
| 请求私有同名镜像 + 原目录包含/路径映射 | 有仓库先例，直接绑定主代码；**推荐先验证**。验证须覆盖相对 include、嵌套 include、同名目录、C/C++、PCH/debugger、路径宏、错误跳转、中文/空格路径和取消/立即重跑。 |
| 把代码送 stdin 或改成预处理后再编译 | 也可固定输入，但改变语言识别、包含路径、路径宏或 PCH 链；当前证据不足，不能因为省一个镜像文件就先改编译行为。 |

未来验证用可控屏障在捕获后修改原稿，再核对实际编译输出及记录 hash，避免靠 sleep/mtime 猜竞态。若推荐路线失败，先修执行者层的绑定方法；不能静默用近似版本顶替。首版不保存本地头文件历史，记录如实说明这部分未快照，不声称可重现整个环境。

这项未验证假设是正式接通 Runner/CPH 的前置条件。本轮没有编译任何样例，也没有改 GCC flags。

## 6. 基础设施实施包与验收点

本节保留研究时的开发顺序与完整验收目标；首批获准的本地源码及实际检查见[实现状态](implementation-status.md)。以下未勾选项不能理解成所有模块都未动工，也不能用首批存储测试替代真实运行采集、页面或完整首版验收。

测试使用所属模块的现有 harness；正式命令在实施阶段按 package scripts 和实际产物预检，不能把下面断言写成已经通过。测试路径也是候选新增路径。本轮只做文档校验。

### B0：执行版本绑定

文件：E05/E06/E07 的 compiler/compilation/执行器；测试在各扩展现有测试归属中添加镜像等价与可控变更用例。

- [ ] 将捕获主代码、编译输入身份与 evidence sink 接口分开；普通运行不依赖 Beacon 是否成功落盘。
- [ ] 完成第 5 节对照矩阵，验证同一捕获内容用于真实编译和记录，原稿后改不会污染 V1。
- [ ] 验证保存、编译失败、启动失败、取消、程序发布及立即重跑仍遵循现有策略；不把诊断的 `-fsyntax-only` 参数搬进 Runner。

### B1：窗口工作区与协调

文件：第 4 节公共契约、主进程服务、窗口桥与 E01/E02/E03；测试：`src/vs/platform/windows/test/electron-main/windowsStateHandler.test.ts`，候选 `src/vs/platform/beacon/test/node/beaconContext.test.ts`。

- [ ] 注册窄桥并完成 slot/root/epoch 恢复传递；最近根共享，窗口选择独立。
- [ ] 准备/校验 `.beaconWork`：同名普通文件不替换，祖先/子路径跨界重定向不通过；不可用根保留选择。
- [ ] 断言 A/B 窗口可选不同根，同编辑器根不合并 Beacon 选择，新窗口不继承几何来源的根，编辑器换根/reload 不改选择。
- [ ] 断言有效根允许 blackout/spot/flood，无根或不可用根只允许 blackout；忙时根不变，任务失败/结束后可重试切换。

### B2：文件队列、资产 owner 与占用

文件：`beaconStore.ts`、`beaconLease.ts`、E10 的历史适配；测试：候选 `src/vs/platform/beacon/test/node/beaconStore.test.ts`、`beaconLease.test.ts`。

- [ ] Runner/CPH 分别约 10 次 FIFO；完整 CPH 轮次一条，Notebook 证据独立。捕获完成且进入编译启动才入队，此后失败/取消算一次，之前失败不算。
- [ ] 低价值缓存批量追加、可重建索引、可丢末批；两队互不挤占，活动旧条目淘汰后不因后续输出重新入队。采集丢弃/覆盖上限不得停止用户程序。
- [ ] 会话固定根并保存自己的独立材料；读取复制与淘汰用短协调，读取返回前确认保存。删除来源对话不删记忆/笔记，缓存淘汰不删已消费材料。
- [ ] 同应用主进程串行协调；多主进程同根参考 E11 作短写占用。对话占用按根真实身份 + conversation ID，归档和异常断连同样验证；不能拿一把锁禁止同根其他对话或普通运行。
- [ ] 验证别名/复制目录不因相同 marker 就被误认同一物理根；保存失败、崩溃和目录替换不显示成功，不清理后来属于别人的文件。

负责人已撤回开发快照兼容要求：不导入安装级旧 `history.json`，不新增迁移 UI、不从旧编辑器 workspace 数组推断 Beacon 归属。当前会话只走所选工作区存储；保护旧安装存储的读取排除仍用于隐私隔离，不承担迁移功能。已有用户文件不随代码清理删除。

### B3：Runner/CPH 真实事实接线

文件：两扩展 `beaconEvidence.ts` 及 E05/E06 真实执行点；消费 B0 的输入绑定和 B1/B2 的 producer handle。

- [ ] 在用户请求执行时取得 root-bound handle，真正进入 spawn 流程提交一次开始事件；捕获/参数准备失败退掉暂存和 busy。
- [ ] Runner 接真实预存 input、成功转发的交互输入及其来源、编译输出、PTY/pipe 分支和退出/取消；控制响应/resize 不混成程序 stdin。
- [ ] CPH 在临时目录清理前捕获该轮完整代码、全部样例 input/expected/actual、checker/判定配置及实际 stdout/stderr；不从最终 UI 反推丢失细节。
- [ ] 验证聊天未打开/模型未配置也落盘；根外源码不归入当前根，记录故障不改变用户运行；重放事件不重复入队，断连标缺失并释放句柄。

### B4：当前页面、受控读取与会话接入

本地源码已连接文本／浏览器已加载页面、Runner/CPH revision 消费及 `inspectContext`，源码和模拟协议检查见[实现状态](implementation-status.md)。下列完整验收目标保留未勾选；Notebook/PDF/图片等 provider 及真实窗口／模型旅程仍待完成。

文件：`beaconPages.ts`、Beacon `context.ts/contextTools.ts`、E08/E09/E10 和原 webview；测试在窗口页面 provider、扩展工具和历史 owner 归属中添加场景。

- [ ] 页面 handle 对应本窗口真实打开标签和现有模型；读取文本最新 dirty 内容，浏览器核对标签/owner/导航，关闭后不能新读。
- [ ] 三档直接读取已经打开的本人 OJ 源码/判题页面，不额外询问；所有材料读取执行既有敏感信息过滤，标明脱敏后的覆盖变化，页面内容不能成为授权指令。
- [ ] blackout/spot/flood 都可读打开的根外 V2，但 blackout 不能补读 V1 队列、页面对应磁盘文件或记忆；关闭页/缺 provider 不走文件 fallback。
- [ ] Beacon 先发对象/版本/覆盖与合法入口说明，再让模型读；工具输入只能选择 host 给出的合法来源，返回材料身份与可修正反馈。
- [ ] 同一会话单窗口打开，历史只列当前根；跨会话材料 ID、路径绕行和模型文字伪造授权都拒绝。用户主动单文件材料不扩大目录/持续追读权限。

基础设施阶段的首个闭环：不开聊天选择根 → 用户在 V1 运行/评测 → 编辑为未保存 V2 → 打开 Beacon → 模型入口能区分 V1/V2并按需读取 → 队列淘汰后本会话证据仍可读。基础设施实现与模型教学效果分开验收；未实际重跑不能宣称 V2 已修复。

## 7. 完整首版的依赖与连接范围

| 包 | 连接位置与首版内容 | 前置与验收依据 |
| --- | --- | --- |
| Notebook | 候选 `extensions/becoder.notebook`：serializer/controller、轻量 `.bcnb`、Markdown/图片/公式、程序块多组 input、真实最新结果；四条完整流程、源码关联及完整改写前备份 | 消费 B0–B4；`.notebook` 归属仍是编辑器根，运行证据看笔记自身是否在 Beacon 根内。改写失败沿原生编辑/保存反馈，无强制恢复原稿。按 [T3](notebook-technical-design.md) 的 N/B 场景验收。 |
| 四平台 OJ | 窗口 browser owner 的页面读取 + 主进程固定只读 adapter，Beacon 工具消费；洛谷、CF、AtCoder、蓝桥的题面、本人同题记录、源码/判定以及 Notebook 整理 | 消费 B1/B2/B4 和 Notebook 写入；当前打开本人页可直接读，额外联网查询个人信息须真实用户许可。使用本窗口既有 session，不代登录/导航遍历未授权记录。四站登录后可得性仍是 [T4](oj-technical-design.md) 的逐站验证项。 |
| 会话压缩与记忆 | Beacon `provider.ts/session.ts` 的输入投影与回读；工作区文本 tips/status 简单追加、原生编辑热更新、主动 dream 及完整旧 status 可读归档 | 消费 B1/B2/B4；只投影不删除原文，当前问题和必要工具协议保留。打开 dirty 记忆文本走原生编辑/保存协调，同根提交短串行；许可依据不可由模型自写或旧归档恢复创造。按 [T5](memory-quality-technical-design.md) 验证。 |
| 完整产品与发布 | 原生 UI、本地化、连接/联网/视觉与兼容模型反馈、Notebook 扩展编译/随包入口、安装包和真实旅程 | 源码接通后核对 `package.json` 的 `compile-oi-extensions` 与 `build/gulpfile.extensions.ts` 等实际入口；当前脚本没有新 Notebook 扩展。正式校验/构建、模型和账号验收按之后的实际授权执行，不能以文档检查替代。 |

B1/B2 可以先把窗口与文件 owner 做对；B0 可独立验证，但 B3 不能在它未通过时把近似捕获标为实际编译版本。B4 的原生页面能力可与 B3 并行接线；Notebook、OJ、记忆逐项消费底座并完成各自首版流程。这里没有承诺天数，也没有以“先做基础设施”为由删除后半部分首版。

## 8. 复用依据、反思与尚未验证项

优先采用 E01–E11 的本仓成熟能力，再吸纳外部窄机制。外部固定源码与许可证已在 T1–T5 保存，不拉一个完整 coding agent 来接管学生项目：

| 来源及固定提交 | 吸纳的工程经验 |
| --- | --- |
| Continue `5522c6f44ca0ac3528b37244818fbfa39b5af470`，Apache-2.0；T1 的 `CurrentFileContextProvider.ts` / `VsCodeIde.ts` | 材料按 owner/provider 产生，编辑器内容优先来自模型；Beacon 需补实际版本、Notebook 结构和明确缺失，不能直接沿用编辑器根范围。 |
| npm/write-file-atomic `23e111d95367e1d987c1b4d7823791eaaf6b21df`，ISC；T2 的 `lib/index.js` | 小型同路径写队列与临时文件替换；进程内串行不是多进程权限证明，不为此安装依赖。 |
| VS Code Notebook 示例 `65c1c44800eeac6fb065a54823ee5ae62c79540a`，MIT；T3 的 `notebook-serializer-sample/src/serializer.ts`、`controller.ts` | 复用 serializer/controller 和原生编辑结果；示例丢 metadata/output 或失败返回空本子的行为不适合保护用户笔记，不能照抄。 |
| Vercel AI SDK `e9c1d2f54da6bd01a16bb8a5fdfcb4b62f34e7d0`，Apache-2.0；T1/T5 的 `prepare-step.ts` / `stream-text.ts` | 保留现有 BYOK/流式框架，在每步组织合法工具和输入投影；不另造模型请求平台。 |

本轮自审后保留以下边界：

1. **基础设施先行**：主进程只管理身份/文件/协调，不知道教学推理；生产者接口不变成执行 API；页面 provider 不成为磁盘读取器。
2. **prompt 引导、工具约束**：引导模型理解 V1/V2/判题区别，不强制一个固定读序；工具执行既定权限。反馈让模型补读/承认不完整，不额外设置通用审查层。
3. **复杂度有实际来源**：跨窗口协调来自明确需求，不建立共享材料池、SQLite/向量库或后台代理。缓存简单 FIFO；追加记忆没有自主维护管线。
4. **资产保存尊重原生流程**：重要会话/记忆要有真实保存结果；Notebook 已撤回的失败回滚要求不复活。文件名存在、buffer 变化、模型说已保存都不是磁盘保存证据。
5. **不假装已有验证**：镜像完整编译等价、窗口 slot 恢复、跨实例占用、页面全量 provider、四站登录详情、dirty 文本并发保存及模型效果仍须实际验证。共享盘/目录替换的可靠性也不能从 Node API 名称推断。

下一轮最有价值的工作是把 B0 的对照实验输入/判定矩阵与 B1 的恢复字段传递补成可执行的验证说明；在明确实施授权前保持源码只读。研究文档本身的 UTF-8、链接、固定来源和语义检查仅证明文档范围。
