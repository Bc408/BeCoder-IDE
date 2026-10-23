# Beacon 与 BeCoder NoteBook 当前实现状态

更新：2026-10-23；发布候选源码基线：`e644d508` 加当前未提交修复。本文记录当前源码覆盖和已知验证边界；正式需求见[文档入口](README.md)。源码证据不替代模型调用、应用构建、包/Setup 或 GUI 验收，也不将旧构建推广为当前工作树的验证。

## 当前能力与所有者

| 能力 | 当前实现与入口 |
| --- | --- |
| 模型设置 | [配置](../../extensions/becoder.beacon/src/modelConfiguration.ts)、[能力](../../extensions/becoder.beacon/src/models.ts)和[设置页](../../extensions/becoder.beacon/webview/Settings.tsx)：DeepSeek、百炼、Moonshot、Ollama；单连接/单密钥、候选确认、供应商启停、主动批量测试、布尔能力修正及参数设置 |
| 工作区与会话 | [协调器](../../src/vs/platform/beacon/node/beaconCoordinator.ts)、[存储](../../src/vs/platform/beacon/node/beaconStore.ts)、[租约](../../src/vs/platform/beacon/node/beaconLease.ts)：窗口独立根、共享最近列表、三档资格、同对话单窗口占用、revision 校验与固定归属；不导入开发期全局历史 |
| 草稿与模式继承 | [会话历史](../../extensions/becoder.beacon/src/history.ts)及协调器：主页隐藏草稿、首次发送转正、文字/捕获附件保存、最后关闭恢复引用、跨临时/持久化类别的独立快照与按版本消费来源草稿 |
| 运行证据 | [执行者采集](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/beaconEvidence.ts)：随用户运行记录实际主代码、输入、编译/输出/终态和覆盖；Runner、CPH 各保留最近 10 条 FIFO，Notebook 独立 |
| 页面读取 | [原生页面入口](../../src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts)与[扩展适配](../../extensions/becoder.beacon/src/context.ts)：本窗口已打开文本、Notebook、已加载网页及 PDF 文字；不打开文件或从 backing file 补正文 |
| 按需工具 | [上下文工具](../../extensions/becoder.beacon/src/contextTools.ts)和[模型入口](../../extensions/becoder.beacon/src/provider.ts)：先给来源/版本和入口元数据，按需读页面或指定运行 revision；运行材料先复制到当前会话再返回 |
| Notebook | [Notebook 扩展](../../extensions/becoder.notebook/README.md)与[领域工具](../../extensions/becoder.beacon/src/notebookTools.ts)：原生独立编辑、源码关联、用户 input 运行、明确请求的新建/改写、最新完整稿备份与原生保存 |
| 错误与恢复 | [错误反馈](../../extensions/becoder.beacon/src/toolFeedback.ts)与[连接恢复](../../extensions/becoder.beacon/src/requestRecovery.ts)：已知错误码提供中英文可行动说明；底层异常正文不进入 UI；输出或完成工具后不自动重放 |

模型设置的完整现行规则见 [Beacon 使用说明](../../extensions/becoder.beacon/README.md)。能力默认支持，服务明确不支持时关闭；容量缺失时使用 32768 上下文、24576 输入、8192 输出 Token 的可修改默认值。这些默认配置不证明模型实际支持或具有该容量。

## 当前交互与存储

- 工作区选择与历史列表仅在主页显示；详情页宿主也拒绝切根。空白主页不建实体，首次输入/附件可建不进历史的草稿，首次发送按原 ID 转正。返回主页保留详情草稿；主页“新聊天”清空主页草稿。
- 有效根下三档均可选；Blackout 保留根但不新增工作区资产读取，临时输入/消息只在内存。主动切档保留页面、文字、附件及显式空白；Spot/Flood 共用身份，跨类别后首次接受新问题才独立继承，来源消息不变。完整规则见[模式设计](mode-conversation-design.md)。
- `.beaconWork/conversations/<id>/conversation.json` 固定属于所选根；同根其他聊天仍可用。真正关闭窗口才发布默认恢复位置，reload 释放所有权但不冒充关窗；自动恢复遇占用静默回主页。只有不再被引用或占用保护的未发送草稿可被淘汰。
- Runner、CPH、Notebook 执行及必要清理/证据收尾期间，Beacon 使用暗淡禁用发送箭头；仅真实回答显示暂停。无工作区也执行忙碌约束，被拒绝发送不排队或补发。证据采集和发送可用性是不同边界。
- 页面结果标识页面 version，运行结果标识 producer/revision；`source` 带来源、捕获时间、表示哈希及可得的编译源码哈希。哈希不证明正确或完整；`truncated` 表示返回范围，`source.partial` 表示已知采集遗漏，未确认覆盖时不填完整标记。
- 运行记录读取固定 revision，先保存为当前会话材料；队列淘汰不破坏该副本。页面、文件、运行记录和会话材料分别授权，不能借 Flood 或页面路径访问别的会话内部资产。
- 联网个人信息许可由 prompt 引导依据真实用户决定和适用范围；没有独立宿主许可台账、审批门或查询意图分类器。本地根/档位、敏感过滤、会话隔离和学习资产写入仍由宿主约束。

## Notebook 与 PDF 的覆盖

`.bcnb` 使用 version 2，支持 C/C++、Markdown 与 `becoder-input`；Markdown 公式/Mermaid、原生图片附件、折叠、插入入口和 Seti 图标已接入。没有旧格式、内嵌 input 或 base64 图片迁移，也没有独立插图按钮。

input 运行上方最近 C/C++ 的最新未保存代码，程序块不自行执行。每份 input 仅保留最近实际结果，输出合并；运行时限 2 秒、输出上限 262144 字节，编译时间单独计算。输入和输出保存在笔记内，符合归属的行为证据独立写入 `.beaconWork`，不挤占 Runner/CPH 队列。

Beacon 工具只接受明确目标和正文/块顺序，不接受模型伪造的 outputs/attempt。新建拒绝覆盖，不产生空占位或旧稿备份；改写先备份最新完整内存稿，再使用原生编辑/保存。运行与改写互斥，dirty 冲突、取消交接及 applied/saved/dirty 如实反馈；失败不自建回滚。

文本、Notebook、PDF 文字选区均可通过“询问 Beacon”加入可查看、移除的草稿，用户发送后才调用模型。PDF 按物理页提取已加载 PDF.js 文档的文字；扫描页可能为空。该路径不含 OCR，也不代表已实现完整图片、公式或版式理解。网页未渲染代码、iframe 和其他未覆盖表示同样不能当作已读取。

## 已有验收与剩余验证

2026-10-20 的三档切换与独立继承改造已完成所属回归、生产 Webview 渲染及 staged Windows 构建，负责人明确反馈该轮体验验收通过。此局部结论保留，不扩大到之后的设置改造、所有异常退出或真实模型质量。

此前草稿/恢复批次做过隔离桌面的选根、保存、Blackout 恢复、正常关窗和部分双窗口检查；这些旧时点证据不等于当前全部组合已验收。模型设置后续已扩展到四家服务，现行源码不能再描述为“仅 DeepSeek”或能力三态；文档清理本身未重新测试服务连接、设置视觉、安装包或 Setup。

## 2026-10-23 发布前修复

- [会话存储](../../src/vs/platform/beacon/node/beaconStore.ts)删除对话时同时清理该对话专属的 `materials`，保留 `.beaconWork` 内独立资产；平台存储测试已覆盖有效对话和遗留材料清理。
- [CPH 执行](../../extensions/becoder.cph/src/execution.ts)停止编译器或自定义 Python 检查器时兼容 Windows 的 `SYSTEMROOT` 键，并在 UI 准备阶段收到停止后阻止执行器启动；CPH 全部可重复测试 64 通过，1 个 PCH 集成检查因可选 gch 未生成而明确跳过。
- [Beacon 工作流](../../.github/workflows/build-windows.yml)和发布工作流通过 `exec.ps1` 传播前面命令的失败，Electron 原生绑定目标从 `.npmrc` 读取；工作流静态检查通过。
- 根版本元数据已更新为 `2.0.0`。源码检查、生产 Webview 渲染、staged Windows 构建和包验证通过；Setup 已生成，但直接 Setup 验证尚未在当前非管理员 PowerShell 会话执行，负责人 GUI 验收也尚未进行。

## 后续版本开发事项

负责人于 2026-10-23 确认 v2.0.0 以当前已实现能力为交付范围。以下尚未实现需求保留到后续版本，不作为本次发布补功能的前置条件：

- 四平台 OJ 本人同题提交/判题专用适配及真实登录后的完整旅程；当前页面文字读取和公共联网工具不能替代它们。
- 工作区 tips/status 的主模型简单追加、直接编辑/热更新，用户主动 dream 和可读归档；自动长会话压缩及本会话回读的完整流程。
- 完整页面视觉材料、图片/公式等覆盖。
- Notebook 尚未完成的完整流程。
- 当前 Notebook 工具之外的讲义、图示等学习资产写入和 PRD 中尚未交付的导航/管理能力。

## v2.0.0 当前能力仍需验证

- 四家服务商真实连接与已实现能力、参数的可用性，密钥临时显示与错误恢复。
- 当前 Notebook 创建、关联、编辑、备份及运行流程；跨窗口 dirty/运行/保存/取消的真实产品体验。
- 工作区根失效恢复、反向关窗、重启、崩溃及断电等涉及已交付数据的异常矩阵。
- 最终候选的源码回归、生产渲染、staged 应用、包/Setup 及负责人验收；范围确认不能替代这些结果。

后续需求没有被撤回，当前能力也没有因范围冻结而自动验收通过。各项验证只证明实际覆盖范围；执行时记录准确源码、命令、结果和限制。
