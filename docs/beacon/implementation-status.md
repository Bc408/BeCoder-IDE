# Beacon 工作区、运行证据与读取入口实现状态

更新：2026-10-13。首批授权覆盖工程蓝图 B1/B2 的工作区／会话与存储底座及必需的 Beacon 消费、界面接线；负责人随后要求继续并允许自行纠错，已连接 B0/B3 的主代码捕获编译和 Runner/CPH 证据生产、B4 的文本／浏览器页面与模型读取、Notebook 原生文档和用户运行，并继续接入已有笔记的 Beacon 改写与完整备份。各批源码检查与未验证项分别记在下面；真实窗口／IPC／模型旅程及完整首版尚未完成。基线提交 `865c504d0795d7b64dc413756916e17ee36696c5`，分支 `codex/BeCoder_Next`；新增实现尚未提交，不存在可引用的新固定提交。正式需求保持不变。

源码事实：

- [窗口协调器](../../src/vs/platform/beacon/node/beaconCoordinator.ts)管理窗口独立选择、共享最近列表、根有效性、spot/flood 资格及忙时拒绝。根失效保留选择，恢复不创建替代目录。
- [原生窗口状态](../../src/vs/platform/windows/electron-main/windowsStateHandler.ts)保存 slot/root/mode/物理身份，经[窗口恢复路径](../../src/vs/platform/windows/electron-main/windowsMainService.ts)传入窗口配置。同一编辑器根的不同 slot 分别恢复；新窗口不从几何来源复制 Beacon 根。真实重启、多窗口、编辑器换根仍待运行验收。
- [文件存储](../../src/vs/platform/beacon/node/beaconStore.ts)校验普通目录、链接和物理身份；会话按根固定保存，短写占用与 revision 冲突检查分开。[Windows 管道占用](../../src/vs/platform/beacon/node/beaconLease.ts)用于单会话独占，不锁住同根其他会话。存储缺失或替换不会被解释为成功保存。
- Runner/CPH 分别保留最近 10 条 FIFO，按批次序号追加，淘汰后迟到输出不重新入队；读到的缓存可先复制进本会话材料再返回。本轮已从真实执行点接出捕获内容、编译尝试、流和终态，不再只有测试显式提供的记录。主进程按物理工作区和 producer 串行短写，避免同根双窗口的普通重叠写入撞锁；不长期锁整个工作区。
- [窗口命令桥](../../src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts)绑定实际窗口；[Beacon 客户端](../../extensions/becoder.beacon/src/context.ts)绑定根和当前会话，读取前后复核 epoch。通用文件工具在 flood 也排除 `.beaconWork` 和旧 Beacon 全局存储，不让路径读取绕过会话隔离。
- [Beacon 扩展](../../extensions/becoder.beacon/src/extension.ts)接入工作区选择、最近根、资格档位、当前根历史、独占打开、保存、重命名、删除。开发期旧历史导入及其安装级存储已按负责人要求移除。
- 主动拖入／选择的单文件在三档均可捕获，保持凭据过滤；之后发送、继续及重答复用已捕获内容，不持续追读磁盘或授予邻居目录权限。未选择根的临时对话只留在内存，选根后不自动转存、不自动建会话。
- Runner 和 CPH 的请求入口与 finally 连接相关任务句柄；源码属于当前根才持久化并占忙碌状态，捕获实际路径仍须匹配该句柄。结束先排空已接收的采集批次再释放；未进入编译不入队，编译启动尝试之后失败或取消占一次。窗口关闭、reload 与 Code-OSS 扩展宿主运行状态清除负责释放占用；实际崩溃旅程尚未测试。

本轮运行证据接线：

- [捕获主代码](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/compilationSnapshot.ts)读一次实际文件，保留原始 bytes/hash、路径和采集时点，写入请求私有的同名编译输入。Runner 和 CPH 生产入口都消费这份内容；保留原有用户保存、语言标准、PCH/debugger、输入和可执行文件发布策略。临时编译目录与 `.beaconWork` 缓存独立。仅主代码绑定，不保存本地头文件历史，也不宣称完整环境可重现。
- 编译适配保留原目录 cwd，增加原目录的 quote include 查找和路径宏映射；编译诊断从私有主文件映射回原文件，支持分块输出。GCC 官方机制见[预处理选项](https://gcc.gnu.org/onlinedocs/gcc/Preprocessor-Options.html)及[目录选项](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html)；本轮实际对照使用现有随包 GCC `16.2.0`，不是从在线手册推断等价。对照覆盖 C、五个 C++ 标准、相对／嵌套 include、路径宏、时间宏、中文／空格路径、PCH/debug 和主文件错误定位。它不构成所有 GCC 程序的等价证明，特殊 `include_next`、跨私有目录的同名文件及更多路径别名仍待扩展验证。
- [共享采集器](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/beaconEvidence.ts)经窗口命令桥批量落盘。Runner 记录预存 input、成功转发的交互输入、编译参数／输出、PTY 或 pipe 来源及终态；转发输入不冒充程序实际消费。CPH 记录冻结的整轮题目／样例、input/expected、判定偏好及 checker 路径、逐样例 actual/verdict/checker 结果。stdout/stderr 与 PTY 混合终端流保持区别。
- 缓存采用约 8 MiB 的每次采集预算、默认最多 1 MiB 的主代码字节副本；正文、input 或流超限明确标记 partial/coverage，并保留原始长度/hash和实际终态，不能说材料完整。预算影响记录而不停止用户程序。约 250 ms 或 64 KiB 触发批量提交，结束时排空；缓存失败轻量反馈，淘汰后不重插。吞吐、重写整个小队列的磁盘代价及真实长运行仍待应用实测。
- 观测时冻结数据，避免异步提交前被后续修改；源身份变化拒绝归入旧句柄。异常断连未留下终态的条目只能解释为终态缺失，不能据此宣称程序仍在运行。生产者桥没有加入模型工具集，模型仍不能执行、停止或提交程序。

B1/B2 阶段修正后的正式验证：Beacon、Runner、CPH 和核心四项类型检查、Beacon host／UI／worker／测试产物构建、101 项扩展测试、20 项核心行为测试及 1 项 harness、两组 lint、完整层级检查均通过。这是该批历史结果，B4 的当前结果单独记录在下文。扩展 CSS 语法由生产 esbuild 检查，变量检查使用仓库既有登记表并核对实际 CSS／组件声明及 Webview 宿主注入，含错误变量名负向检查；未把原始 stylelint 对合法局部变量的误报和 0 退出码当作干净结果。扩展 JavaScript 构建不等于应用或 Setup 构建。

第一轮核心 lint 的 6 项警告已在负责人允许自行纠错后修复。存储失败不再由清理异常盖掉首要原因，回归验证同时保留错误信息和原会话／版本。另修复了忙碌结束缺少通知、消费端刷新吞掉后续变化的问题；使用明确屏障复现并验证，避免靠时序猜测。原失败日志保留，后续检查有独立轮次记录。原生窗口状态 roundtrip 测试已加入 Electron 所属套件，未宣称由 Node 测试执行；真实关闭／崩溃、重启、任务取消及界面反馈仍需产品运行验收；开发期旧历史导入已撤回。

## B4 首批页面与模型入口

- [窗口页面适配](../../src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts)枚举实际打开的活跃／非活跃标签及 diff 两侧；文本仅用已存在的 `IModelService.getModel`，读取最新 dirty 内容，不 resolve、打开文件或从 backing file 补正文。页句柄绑定实际 editor/model；关闭、模型替换、版本或导航变化反馈失效。无现有 provider 的页明确反馈缺失。
- [页面读取协调](../../src/vs/platform/beacon/common/beaconPages.ts)复核读取前后仍打开且版本匹配。[浏览器只读采集](../../src/vs/platform/beacon/common/beaconBrowserPage.ts)通过已加载 view 的隔离世界固定脚本，复用 owner window、loading、导航／关闭复核与超时释放机制；仅取主 frame 已渲染文本和可见 textarea 的当前值，不导航、不 fetch、不读 cookie/storage/隐藏表单。浏览器版本是宿主不透明标识，URL 另行过滤，避免带凭据的 URL 被当作版本参数。
- 三档均可读根外当前文本页及已经打开的本人 OJ 页，不因页面个人信息再问许可。凭据页、旧 Beacon 全局存储及其他会话资产仍排除；文件页的路径检查只查元数据，包括文件已移走时的最近存在祖先及目录别名，不读取磁盘正文。更多目录替换／页面历史身份竞态仍需真实窗口验证。
- [宿主消费入口](../../src/vs/platform/beacon/node/beaconCoordinator.ts)固定本窗口当前会话；列表只返回记录身份、revision、主源码路径/hash 与是否已有终态，不返回代码或样例正文。详情在队列短协调中核对 revision，先写本会话不可变材料再返回；原队列随后可正常淘汰。其他会话及 blackout 无记录入口。原始记录、输入字节和完整已采集事件保持在材料内。
- [上下文工具](../../extensions/becoder.beacon/src/contextTools.ts)先给模式／根／页面版本及运行记录摘要，再提供 `inspectContext` 的 overview/pages/page/records/record/material 操作。record/material 可直接选择 code/events 部分，事件视图保留源 hash／覆盖说明并指向代码部分，不再重复主代码字节，避免为读编译输出先翻过大源码。输入无任意路径、window/conversation ID、执行或提权操作；每次宿主访问前后核对请求归属。首次读页固定请求内快照，实际返回的分页结果随原会话协议保存；blackout 只留内存。运行记录续读转向已消费 revision，不随后台追加或 FIFO 淘汰漂移；新输出须另读新 revision。
- 模型阅读视图将 bytes 字段解释为带覆盖说明的 UTF-8 文本，相邻流片段先合并再过滤；凭据模式、私钥、Bearer 及敏感字段在完整表示上处理后分页，反馈脱敏与来源 hash。它不保证识别任意没有标识的秘密，也不改变原始运行 bytes。默认每次 32768 字符，可续读，每次最多 131072 字符，本轮返回预算 8 MiB；超限或读取／保存失败如实反馈。
- [模型接线](../../extensions/becoder.beacon/src/provider.ts)复用现有 AI SDK/BYOK/流式恢复与协议。只有确认支持工具的模型注册 `inspectContext`；blackout 仍不注册文件工具，网页工具沿既有开关运行。不支持工具时说明只提供了元数据。完成的工具结果与调用编号保留，后续问题可重放；页面、缓存或模型文字不能变成许可依据。

B4 最终检查：108 项 Beacon 扩展测试、28 项核心行为测试及 1 项 harness 均通过；Beacon 类型／产物、全客户端类型、两组 lint、CSS 变量检查及完整层级检查通过。生产 DOM 脚本另用现有 JSDOM 在独立静态样例验证 dirty textarea、隐藏值及密码框排除；innerText/布局矩形来自 fixture，不冒充 Electron 渲染验收。曾复现并修复：文件移走后的目录别名隔离缺口、后台记录变化打断分页、大代码遮挡运行事件、flatMap 类型推断，以及两项 lint 警告；失败日志与后续轮次分别保留。

后续仍属于完整首版：Notebook 全部流程验收，Notebook/PDF/图片等完整页面 provider，四平台 OJ 的联网个人信息许可与专用查询，主模型简单追加 tips/status 与用户 dream。新目标创建、父子目录建议及已有目标改写与备份接线见后文，不表示这些流程整体完成。当前通用浏览器读取只覆盖已渲染文本／可见 textarea；iframe、图片、虚拟编辑器未渲染的代码等不能声称已读完整。个人信息联网许可规则已写入 prompt，受控许可及四站查询适配器尚未连接；既有公开网页工具不能代替这一验收。记忆写入尚未接入，不由已有底座、DOM 样例及模拟模型请求缩减这些范围。

## Notebook input 与附件体验迭代（2026-10-13）

### input 改名目标纠错与后续优先级

单元格工具栏经 Code-OSS `extHostNotebook.ts` 将点击目标转换为 `NotebookCell`，原改名命令却忽略此参数，取当前选区。当前修正为点击目标优先、命令面板回退到当前选中 input；删除或关闭后的目标不回退到其他单元格。提示前后复核目标及可编辑状态，调序后使用该单元格的最新索引和 metadata。Notebook 21/21、所属 typecheck/build、三个当前普通文件的 scoped ESLint 均 exit 0；未构建新 Windows 应用，真实工具栏交互仍待验收。开发 RED 与最终命令见[验证台账](notebook-experience-plan.md)。

负责人随后要求手头任务完成后通读文档、优先补齐未实现功能。正式基线与当前源码对照的下一优先项是 Beacon 新目标 Notebook 创建：现有 `NotebookEdits` 与协调器仅开放已有文件改写，不能完成首次生成流程。后续应补全新目标及源码关联/父子目录处理，再连接 PDF 选区和完整页面材料、四平台 OJ 许可/查询、工作区记忆简单追加与主动 dream。此顺序是工程依赖排序，不缩减首版范围；已有实现的 GUI/跨窗口/模型验收与功能缺失分别记录，不把测试通过当作完整功能交付。

### 后续开发期兼容清理（当前源码）

负责人明确无需保留项目旧测试数据兼容，并要求删除“在笔记文本中插入图片”的按钮和相关选图实现。当前仅支持 version 2；删除 version 1 迁移、旧内嵌 inputs 及结果推断、旧 input 撤销辅助、旧 base64 图片迁移及其 markdown-it 依赖/类型配置。Beacon Notebook 编辑协议仅使用独立 `becoder-input`，不再生成旧结构；删除图片占位句柄往返。图片粘贴和附件 metadata、原生保存/撤销继续保留，独立选图命令/菜单/本地化已移除。安装级旧聊天导入按钮、消息入口、HistoryStore 及其专用测试也已删除；当前工作区会话存储保持。

本轮检查：Notebook 19/19、Beacon 113/113，无跳过；所属类型、全客户端类型、完整 OI 扩展编译、scoped ESLint（零诊断）、7份 manifest/本地化/配置 JSON、文档结构及 scoped diff 检查通过。旧格式拒绝与正文不自动改写测试已观察失败后通过。没有重新构建 Windows 应用或启动 GUI，上一轮验收包仍包含清理前实现。没有删除用户文件、测试数据目录或既有备份。后续验证记录见[实施计划](notebook-experience-plan.md)。

负责人已认可附件方案并直接授权修改。当前工作树使用独立 `becoder-input` 单元格：左上工具栏新增 input，用户运行该 input 上方最近 C/C++，代码块只有编辑/展示；每份 input 保存最近真实结果与分阶段时间。原生全部运行/选区执行仅运行 input，依次处理，停止后不自动继续；代码块不创建原生执行状态。

`.bcnb` 仅使用 version 2，开发期旧格式和内嵌 inputs 不作迁移。每次捕获未保存代码/input，私有临时编译与 Windows Job 生命周期保持原执行者所有权；程序输出通过 helper 的 Notebook 专用参数在句柄层合并，记录注明 merged，普通 cerr 不自动染色。编译使用宿主单调时间，程序完成时间由 helper 的单调时钟返回。

图片粘贴使用短 `attachment:` 正文及单元格 metadata，同次原生 WorkspaceEdit 进入撤销/保存；使用现有 ipynb 附件 renderer，不新增 Jupyter kernel。不提供独立选图插入按钮或命令，不迁移旧内嵌图片。保存取消重复 JSON 往返。文本页面与内容编辑接口只描述图片名称/MIME/大小，不将附件 base64 发给模型；完整保存/备份仍包含附件。

输出采用一个可追加的自有 MIME 流，Notebook 输出模型复用原生合并/增量机制。renderer 复用 Microsoft MIT ANSI 解析及终端主题色，流式适配保存完整控制码和当前样式；不新增 shell/PTY 交互界面。MIT notice 随 renderer 产物保留。

历史检查（不作为当前实现说明）：Notebook 22/22、Runner 91/91、Beacon 115/115，无跳过；全客户端类型、完整 OI 扩展编译、scoped ESLint（零诊断）、input CSS、完整层级及文档结构检查均通过。隔离真实 C++ 样例确认 cout、普通 cerr、debug 的合并次序及原始颜色码。主代理只读自审还修正了原生输出复制与旧图片迁移误改代码示例；迁移复用既有 markdown-it，完整许可证随扩展打包。失败及纠错轮次见[实施计划与验证台账](notebook-experience-plan.md)。尚未构建本轮新的应用包或验收 GUI、图片粘贴撤销、长输出手感及性能；现有 1.2.0 安装不能验证本轮工作树。

## Notebook 原生底座的历史验证（2026-10-12）

首批实现及当时检查覆盖 serializer、关联、独立执行、Windows Job、代码/input 捕获、Beacon 区内证据和页面读取；当时 Notebook 6/6、Runner 90/90、CPH 64/64、Beacon 108/108 及核心 32 项通过。独立样例覆盖 C 空输入、C++ 本地 include/cwd、退出码、取消与大输出。这些是历史源码/样例证据，不是当前 GUI 或模型验收。

当时的内嵌 inputs、专用输入 UI、分区输出及内嵌图片路线已移除，不再提供过时源码入口。当前行为见上方体验迭代及下方 UI/类型记录；关联与执行继续保留，四条完整流程仍按正式需求验证。

## 已有目标笔记的 Beacon 改写与备份（2026-10-13）

以下为当时接线记录；随后新目标创建见下一节，历史限制不作为当前产品规则。

- [主进程资源占用](../../src/vs/platform/beacon/node/beaconNotebookResources.ts)复用 Windows 管道租约；不同用户程序块可分别运行，任一运行存在时拒绝目标改写，改写时拒绝新运行。窗口拥有独立资源身份，关闭／重载释放旧占用，异步晚到请求复核原窗口身份。已报告的其他窗口 dirty 副本拒绝改写，不静默取其磁盘旧稿。跨窗口状态由原生工作副本事件报告，实际通知／冻结竞态仍需 GUI 验证。
- [协调器授权](../../src/vs/platform/beacon/node/beaconCoordinator.ts)按实际窗口、当前根／模式／会话／epoch 复核已保存 `.bcnb`；spot 拒绝根外目标，blackout 没有写入口，学生 C/C++、私密路径与 Beacon 会话资产排除。模型写目标不得为符号链接或多重硬链接，避免用文件名别名改到受保护对象。已有笔记改写占用也计入本窗口忙碌状态。这里只开放已有正式 `.bcnb`；新目标创建路线仍待接通，不增加手写笔记或备份的普通编辑限制。
- [原生只读接线](../../src/vs/workbench/contrib/becoder/electron-browser/beCoderNotebook.contribution.ts)将资源状态传入本类型 [EditorInput capability](../../src/vs/workbench/contrib/notebook/common/notebookEditorInput.ts)，同步同文档视图及 input UI；不修改 OS 文件属性／全局只读配置。用户运行入口先取得独立运行句柄，实际收尾后释放；模型工具没有该动作。
- [Notebook 所有者](../../extensions/becoder.notebook/src/editApi.ts)先获合法目标，再读取已打开的共享模型或在有文件权限时打开指定已有文件；完整捕获当前文本、代码、独立 input、附件、outputs、executionSummary 和 metadata，不保存原稿、不保存其他文档。[普通完整备份](../../extensions/becoder.notebook/src/backup.ts)通过 serializer 写同目录最近 `.bcnb-backup`，校验父目录和目标、只清理自己的临时文件；备份失败不编辑。捕获期间模型版本改变则反馈冲突并退出，不声称晚到图片／输入已经纳入原快照。它与原生自动恢复备份分开；恶意外部并发替换路径不是这里的原子保证。
- [内容映射](../../extensions/becoder.notebook/src/edits.ts)只接受块顺序、ID、种类、source、语言和 input 名称；既有块省略 source 时原值保留，新块必须有内容并获得新 ID。outputs、attempt、executionSummary 等字段不能由模型提交；保留块携带原真实结果，新块无结果。数据进入原生 WorkspaceEdit／NotebookEdit，再保存当前目标。失败反馈 applied／saved／dirty／revision，实际部分应用不会倒报成没改；保存完成后的取消不倒报成未保存。无需采纳按钮、自建回滚或付费审查模型。
- [Beacon 工具](../../extensions/becoder.beacon/src/notebookTools.ts)按请求持有私有句柄，在结束／中断时收尾，包括晚到 begin 与释放失败。prompt 限于用户明确要求的清楚目标，五部分题目笔记骨架作为组织引导；宿主强制路径、版本、可编辑字段与结果所有权。begin 先给块目录；read 可按 cellId 和 content／outputs／attempt（独立 input 读取 content） 读取，默认不先塞大输出，附件保持原 cell ID 上的宿主 metadata，不往返图片句柄；返回前完整脱敏再分页。修改候选为完整有序块列表，原有字段可保留。完成的调用和实际保存反馈保留在会话协议中，历史工具句柄不产生新请求权限。
- 编辑器／Notebook 的“询问 Beacon”将当前文字或代码选区加入可查看、可移除的草稿，由用户补问题并发送；不自动发送、不读 backing file、不触发写入或运行。已打开文件／Notebook 的私密与会话资产检查只查元数据。PDF 选区、完整图片／PDF 模型输入、四站 OJ 材料及新目标生成仍未因此获得完成证明。

最终测试：Runner 90、CPH 64、Beacon 113、Notebook 12、核心 33 项行为与 1 项 harness，共 313 项通过；无跳过。全客户端与所属类型、四扩展产物、两组 lint（主仓 56 个输入）、CSS、完整层级检查通过。真实 Windows 租约与隔离文件测试覆盖运行／改写互斥、dirty 报告、scope 失效、窗口退出、学生文件／硬链接保护及完整备份；注入的 Native port 覆盖备份失败、最新 dirty 原稿、部分应用、保存 false 与取消交接。AI SDK 协议使用模拟 SSE／工具返回，不是付费或真实模型质量验收；Native WorkspaceEdit、保存冲突、所有已发起图片粘贴的交接、跨窗口通知及焦点／撤销仍待真实产品验证。初轮 lint 已停止并保留，修正及复查轮次单独记录。

尚无应用／Setup 构建、GUI、账号或真实模型验收，HEAD 未变；四条流程、四平台 OJ、简单追加记忆与用户 dream 的完整首版范围保留。

## Beacon 新目标 Notebook 创建（2026-10-13 当前源码）

负责人要求继续补齐未实现功能后，现有 `editNotebook` 增加一次性 `create`：明确 path 或 sourcePath（二选一）与完整有序 cells，在内容生成完成后进入原生 `WorkspaceEdit.createFile`，不先落空文件、首次不作备份、不运行程序。新块只接正文/语言/input 名称，不能提交 outputs、attempt 或 metadata；已有目标拒绝覆盖，向模型反馈目标冲突，不能自动另选文件名或改写。

Notebook 扩展按实际打开根解析源码关联，镜像完整源码文件名；独立路径不推定来自 Beacon 根。无打开文件夹禁止新建。源码不在打开根内则要求打开/添加对应目录；编辑器仅打开子目录且 Beacon 根在父级、父级已有 `.notebook` 时返回打开父级建议，不新建子级 `.notebook`、不切根。模型获得这些反馈后遵循明确目标和用户请求，不静默替代。

主进程复用资源租约，对尚不存在的目标取得独占、核对 scope/窗口、最近现存祖先的物理身份、真实位置与档位；spot 拒绝根外，blackout 无入口。目标存在、重定向父级、祖先替换、学生源码/Windows 命名流、敏感路径和 `.beaconWork` 均拒绝。原生窗口桥还拒绝已打开工作副本，防止磁盘文件消失后覆盖仍在内存中的用户稿。关联目录准备前先授权，提交前再次核对编辑器根与主进程 scope；不宣称能抵抗核验后恶意外部瞬时替换的所有竞态。

原生创建前取消不写笔记；一旦进入原生创建阶段按实际结果反馈，不自建回滚或删除。创建成功但打开失败仍报告 created/saved；释放失败保持仅用于收尾的请求私有句柄，请求结束重试释放。扩展退出等待已进入的创建操作并清理自身占用。新建和既有改写分别处理，未改变完整备份规则。

源码验证：Notebook 24/24、Beacon 116/116、核心 33 项行为加 1 项 harness（34/34）；无跳过。完整 OI 扩展编译、全客户端类型、完整层级、scoped ESLint（12 个普通文件）、文档结构及 diff 检查通过。真实 Windows 租约/临时目录测试涵盖缺失目标、同名冲突、根外权限、链接/替换祖先与关联目录准备；创建/失败/取消使用注入 Native port，SDK 使用模拟 SSE。原生 WorkspaceEdit、文件创建撤销、GUI、跨窗口报告竞态及真实模型笔记质量尚未验收；没有构建新 Windows 应用或 Setup，没有账号/付费调用或 Git 写操作。精确命令、类型标注失败与开发 RED 见[创建实施台账](notebook-create-plan.md)。

## Notebook 视觉、独立 input 与类型入口（2026-10-14 当前源码）

`.bcnb` 类型选择仅 C、C++、Markdown、独立 input（becoder-input）。编辑/序列化/模型内容工具一致，不提供旧 plaintext input 迁移。Markdown 内的其他语言示例不受影响，普通编辑器及 ipynb 不缩减语言支持。公式/图示复用已有随包 KaTeX/字体与 Mermaid renderer，后台实例已实际显示数学表达式及 SVG；不是完整 TeX 文档编译。图片只保留原生附件能力，没有新增按钮或流程。

input 编辑框不再显示原生执行勾号/总耗时或额外状态行；英文状态与 compile/run 时间集中在下方输出，程序流保持普通合并输出，debug 由自身 ANSI 着色。字体改用 Notebook Webview 实际提供的编辑器字体变量，避免回退界面字体。删除旧额外状态呈现组件/高度，原生块间工具栏增加 input 并在 `.bcnb` 预留空隙中居中；点击位置决定插入位置。原生非 BeCoder Notebook 布局保持。

专用隔离笔记真实运行已显示 `OK | compile 735 ms | run 8 ms` 与默认/紫色输出；类型列表与真实插入/保存行为已复验。27 项 Notebook、120 项 Beacon 测试、核心/扩展类型与 lint 通过。最终构建、包验证及具体错误/迭代证据见[本批台账](notebook-ui-plan.md)；代理检查不替代负责人验收。无依赖安装、付费模型调用、账号操作或 Git 写操作。

## PDF 指定页文字读取（2026-10-13 当前源码）

既有 inspectContext 已接入本窗口 PDF 扩展的打开文档列表与指定物理页读取。列表只交付来源、版本、页数/未就绪反馈；模型传 listed id/version/pageNumber，再按 offset/nextOffset 分页。复用 PDF.js 已加载 Worker 的 getDownloadInfo/getPage/getTextContent 和原生文字拼接规则，不建第二加载器、解析器或长期缓存；等待原生完整加载之后才允许模型请求，以免沿页面路径触发 PDF 源文件分段补读。用户原生打开/加载保持。

隐藏但已打开的 PDF 标签保留 Webview 状态，选区入口仍限可见页。关闭、重载、旧版本、越界、未加载和超时如实拒绝；工作区/会话 scope、敏感源元数据、脱敏先于分页及请求内快照复用 Beacon 既有规则。三档可读页面，不授予打开文件、导航或自由磁盘能力。扫描型空文字反馈 textAvailable=false，表示没有可提取文字，不表示空白页；图像、OCR、公式结构与完整视觉理解仍是独立缺口。许可/账号/运行边界未改。

测试与验证见[指定页实施台账](pdf-pages-plan.md)。本批无应用/Setup 构建或 GUI 验收，不以模拟 host/Worker 接口测试代替实际阅读器体验。

## PDF 文字选区求助（2026-10-13 当前源码）

内置只读 PDF 的 textLayer 选区现提供原生右键“询问 Beacon”。右键时冻结文字，PDF 所有者以请求标识/加载版本交付，源 URI 由实际打开 panel 决定；菜单不接受任意传入文字或磁盘路径。关闭、重载、未加载和超时如实拒绝。复用现有唯一 VS Code host API，不重新 acquire；PDF 打印/下载/脚本等原限制保持。

Beacon 的代码/Notebook/PDF 选区共用草稿接入、凭据过滤、预算与当前会话检查；用户补问题后发送，动作自身不调用模型。三档均可用，blackout 草稿仍留内存，合法根无聊天时沿用用户明确求助建立本区聊天的规则。预览使用内存文本页，不打开 PDF backing file。页面关闭或工作区切换期间的迟到材料丢弃；没有 OCR、整页读取、PDF 图像或完整公式理解能力的完成声明。

最终源码检查：Beacon 119/119、PDF host/DOM 4/4；所属类型、完整 OI 扩展编译、scoped lint、JS syntax、JSON/本地化及 VSCE 文件清单通过。新测试不入包，所有 runtime assets/source/license 保留。PDF 扩展/PDF.js 的 Apache-2.0、Beacon 的 MIT 归属不变；没有新增依赖。第一次 lint 的 header 失败及修正见[选区实施台账](pdf-selection-plan.md)。真实菜单/focus/选字手感、扫描型 PDF/图像/数学材料与完整页面 provider 仍需实现或运行验收，未构建新 Windows/Setup，未进行账号、付费调用或 Git 写操作。

## 第一轮 Notebook 集成验收准备（历史构建阶段）

负责人已允许收口已有链路、执行源码检查、构建 Windows 应用并直接校验含编译器的包，交付完整应用目录供手动验收；本轮不做 Setup、GUI、账号、真实模型或 Git 写操作。

入口核对发现并复现两项问题：合法工作区尚无聊天时选区草稿不能发送，新建聊天会清除它；选区预览错误尝试读取对应文件路径。现已修正为用户明确调用“询问 Beacon”时在原工作区建立聊天，已有聊天复用、blackout 保持临时；工作区/页面失效则丢弃迟到采集。预览通过原生内存文本页显示捕获的文字，不打开 backing file。普通切换工作区不自动建聊天。两项回归先失败后通过，所属 Beacon 115 项测试与类型/lint 已通过；其余构建及包结果在本轮完成后单独记录。

标准构建将重建既有 `VSCode-win32-x64` 输出，而该目录已含真实配置/历史；开始构建前保留完整副本至独立 `Beacon-acceptance-preserved-20261013`，7,941 个文件共 1,109,921,319 字节逐文件校验一致。原应用用户资产保留在该目录，新验收包不自动迁入这些资产。此副本不是 Git 提交或云备份。

## 2026-10-14：Notebook 原生入口与缓存显示

已补齐原生“新建文件…”列表与命令入口，资源管理器空 bcnb 打开、Seti 深浅主题 Notebook 图标和中英文输入控制。运行快照记录 C/C++ 块序号，独立临时目录内源文件使用笔记名-code序号，GCC 相对路径诊断；本地头文件与程序 cwd 保持原目录规则，证据记录真实编译及运行 cwd。Notebook 29/29、Runner 9/9（真实 GCC、无跳过）、定向 lint、类型及扩展检查、最终 Windows build 和 IncludeCompiler 包校验通过。独立测试配置与私有 Windows 桌面确认中文新建、输入入口、图标、空文件及短 CE 诊断；测试窗口已关闭。语言包新增两条原生翻译，来源与打包摘要同步，完整性检查保留。详情与失败/纠正记录见 [UI 台账](notebook-ui-plan.md)。没有 Setup 或 Git 写操作，负责人验收尚未完成。

## 渲染与开发快照残余审查（2026-10-14）

删除不用的 rehype-katex、Shiki 渲染引擎/主题声明与锁依赖，仅保留实际语法资产；不削减既有高亮、公式及附件。校正旧渲染测试的权限、viewKey 与完整宿主快照，未给生产代码添加兼容测试快照的分支。流式公式扫描已补缩进代码回归。当前审查与验证证据见[专项台账](render-review-plan.md)，源码修复不代表负责人验收。
