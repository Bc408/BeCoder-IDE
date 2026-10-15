# Beacon 与 BeCoder Notebook 当前实现状态

更新：2026-10-15。本文描述当前源码和剩余能力，不再混排早期阶段快照。最后已提交基线为 `6cf90af024a047d394d3c5f5a968b536294792a8`，分支 `codex/BeCoder_Next`；此前 Beacon/Notebook 功能提交为 `0ebf5c5a`。Beacon 工作区/会话交互调整及前序来源说明、反馈优化仍在工作树，尚未提交。正式需求以[PRD](prd.md)及负责人最新直接决定为准。

## 已实现的调用链

- [窗口协调器](../../src/vs/platform/beacon/node/beaconCoordinator.ts)管理独立 Beacon 根、三档资格、忙时拒绝切根、固定会话归属、同对话单窗口占用及请求 scope 校验。[存储](../../src/vs/platform/beacon/node/beaconStore.ts)与[租约](../../src/vs/platform/beacon/node/beaconLease.ts)负责共享工作区资产和短写协调；无根、根不可用或用户主动 Blackout 时均不消费工作区资产。开发期安装级历史导入已移除。
- [运行证据生产](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/beaconEvidence.ts)捕获用户发起的 Runner/CPH/Notebook 运行。Runner 与 CPH 各保留最近 10 条 FIFO，Notebook 证据独立；记录主稿快照、哈希、编译配置、输入、真实流、终态与采集覆盖。记录采集超限或失败不停止用户程序，淘汰后迟到输出不重新入队。
- [页面入口](../../src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts)只读取本窗口已有文本模型、Notebook 模型与已加载浏览器页面；不 resolve、打开或从 backing file 补正文。[PDF 桥](../../extensions/becoder.beacon/src/context.ts)使用已有阅读器按物理页提取文字，带页面版本、页数和未就绪反馈。三档均可按需读打开页面，读前后复核身份/版本及受保护资源。
- [上下文工具](../../extensions/becoder.beacon/src/contextTools.ts)先交付元数据和入口说明，再按需读取页面或指定运行 revision。运行材料先复制到当前会话，再交付模型；本轮分页固定快照，后续可回读本会话 material。模型协议保留已完成的调用和结果，不读其他会话。
- 上下文阅读结果统一携带 `source`：kind/id/origin、页面 version 或运行 producer/revision、capturedAt、contentSha256、可得的 sourceSha256、表示方法及可得的采集 partial 标记。contentSha256 是完整捕获表示在脱敏/分页前的哈希；sourceSha256 是生产者实际编译主稿的字节哈希。truncated 描述返回范围；source.partial 汇总已知的主稿或事件采集缺失，未建立完整覆盖时省略，不能将尚无终态的材料报为完整。原始材料和队列格式不因此迁移。
- [模型入口](../../extensions/becoder.beacon/src/provider.ts)沿用 BYOK、能力判断、AI SDK 和已有恢复机制。页面/运行/文件/Notebook 工具的实际失败经[已知错误码](../../extensions/becoder.beacon/src/toolFeedback.ts)进入活动栏，并有中英文可行动说明；底层异常正文不进入 UI。缺少必需 activities 的开发期消息快照不再补为空数组，而作为不可读数据反馈，不覆盖原文件。保存失败与释放失败按实际状态反馈，模型协议仍保存真实结果。
- 联网个人信息仍须有真实用户的明确许可；最新决定采用 prompt 软约束，引导模型理解已有范围、必要时问询及尊重撤销。不新增宿主许可凭据、审批门或查询意图分类器。页面读权、本地根/档位/会话隔离、敏感过滤与学习资产写入条件继续由已有宿主入口执行。

## Beacon 主页、历史与档位交互

本轮源码已把“工作区/历史/新聊天”收敛到同一主页，并把已打开聊天拆成明确详情页：

- 工作区选择器仅在主页显示，紧挨连接设置左侧；右锚点固定，悬停向左展开绝对路径、点击整体向下展开。顶部当前项不重复进入最近列表；当前项取消后动画移入最近列表并保持面板打开，最近项删除只移除列表记录。Blackout/故障保持图标与路径说明，三个菜单互斥。详情页收到迟到的 `selectWorkspace` 等工作区消息也会被宿主拒绝。
- 左下角三档始终显示。无根或根不可用时 Spot/Flood 禁用；首次选根默认 Spot，根间切换保留现有档位。主动 Blackout 保留已选根，但上下文客户端不暴露其历史、记忆、运行材料或文件根。
- 主动 Blackout 或持久化聊天所用根失效时，详情页返回主页，Blackout 主页不显示该根历史。恢复 Spot/Flood 后恢复对应工作区主页草稿；临时输入不自动复制到工作区。
- 详情返回与右上角按钮保存当前草稿并恢复主页草稿；主页“新聊天”才清空文字/附件并删除未发送草稿。首次输入文字或材料建立不进入历史的 draftOnly 对话，首次发送原 ID 转正；空主页不创建实体。Blackout 只用内存草稿。文字与捕获附件统一持久化，输入/附件队列在导航和关闭前交接。
- 模式、工作区、历史操作在回答、相关运行或必要保存进行时不切换；宿主先完成自己的草稿保存，再刷新原生忙碌状态判断。最近列表移除当前根会取消选择并将它去重置顶，不删除 `.beaconWork`。

工作区恢复引用由原生宿主记录，扩展 reload 只释放资源，真正窗口关闭才发布默认恢复位置。关闭按宿主观察顺序串行发布，显式空白不回退旧草稿；自动恢复遇占用静默回空白主页。淘汰仅针对不再被恢复引用、活窗口引用或占用保护的未发送 draftOnly 对话；已发送聊天及其草稿不受此清理影响。

本轮源码验证：Beacon 类型检查、生产 bundle、142 项 Node 测试、零警告 lint，原生协调器 38 项测试、客户端类型检查及分层检查通过。生产 Webview 的完整 Playwright 渲染与独立工作区交互检查通过，已检查深浅色及窄栏截图。完整应用构建首次因正在运行的输出目录报 EBUSY，关闭后重构成功；最终 staged 构建及绝对路径直接包校验（含编译器）通过。隔离桌面已验证选根自动 Spot、草稿落盘、取消根移入最近项、Blackout 隔离/恢复、正常重启草稿及显式空白恢复。关闭竞态在实际日志发现后改用 onBeforeShutdown 保存，最终构建已验证快速输入后正常关闭的草稿及恢复引用落盘，不再出现原保存调用取消。真实双窗口已验证占用目标静默空白、独立输入、A 先关 B 后关时 B 成为恢复目标且旧草稿淘汰。反向关闭、崩溃及断电等完整矩阵尚未全部做 GUI 验收。记录见本机 tmp/beacon-workspace-drafts/validation.md；无真实账号或付费模型调用。


## Notebook 与 PDF 当前能力

`.bcnb` 使用 version 2，独立 C/C++、Markdown 和 becoder-input；原生新建入口、Seti Notebook 图标、输入按钮/插入位置、折叠、Markdown 公式/图示及原生图片附件已接入。没有旧格式/内嵌 input/base64 图片迁移或独立插图按钮。用户运行 input 上方最近 C/C++ 的最新未保存内容；代码块自身不执行。程序输出合并，普通 cout/cerr 采用默认色，debug 的 ANSI 着色由其库提供；状态与 compile/run 时间统一在输出块显示。

最新提交限制程序运行 2 秒、程序输出 262144 字节，超限结束任务并如实显示；编译时间不计入程序运行时限。编译缓存文件名含笔记名和代码块序号，诊断使用短相对路径，本地头文件及用户程序 cwd 保持所属规则。无需 OS 注册表文件关联，资源管理器类型描述由系统默认行为决定。

Beacon 已有新建和改写 Notebook 的领域入口；只接用户明确目标和正文/块顺序，不接伪造 outputs/attempt。已有笔记先备份最新完整编辑稿，再用原生编辑/保存；首次创建拒绝同名覆盖，没有旧稿备份。运行与改写互斥、其他窗口 dirty 冲突、实际 applied/saved/dirty 状态及取消交接由已有 Notebook/宿主所有者负责。改写失败没有自建回滚。

文本、Notebook 和 PDF 文字选区通过“询问 Beacon”加入草稿，用户发送后才调用模型；预览使用内存内容。PDF 文字抽取不等于 OCR、图片或完整公式/版式理解。

## 验证与剩余范围

本轮 Beacon 所属类型检查、生产 host/UI/worker 构建、完整 133 项扩展测试、零警告 lint、生产 Webview 渲染、原生 35 项测试、客户端类型检查、OI 扩展预发布、Windows staged 应用构建、直接 package 校验、文档结构与 git diff --check 均通过。渲染覆盖中英文、窄侧栏、工作区历史入口、Blackout 历史隐藏、从手动 Blackout 恢复档位及既有高亮/公式/活动/会话/设置功能；截图已检查。没有新增依赖、账号操作或付费模型调用；不宣称真实模型质量或桌面 GUI 验收通过。

历史实际检查保留在专项台账：[Notebook UI](notebook-ui-plan.md)、[Notebook 创建](notebook-create-plan.md)、[渲染审查](render-review-plan.md)、[PDF 页读取](pdf-pages-plan.md)和[PDF 选区](pdf-selection-plan.md)。这些是各批当时的证据，不表示当前工作树已经完成 GUI/模型验收。

完整首版仍须完成四平台 OJ 本人同题材料适配与真实旅程、工作区 tips/status 简单追加、用户主动 dream、完整页面视觉材料及教学质量验证。用户控制记忆质量，不引入复杂自主维护。Notebook 四条完整流程及跨窗口/保存/取消的真实产品验收仍需逐项记录；源码测试、渲染 fixture 和历史应用构建不替代负责人验收。
