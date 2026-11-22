# Beacon 实现状态与下一阶段差距

核对日期：2026-11-22。源码基线：`Beacon_Next`，`e28ac79c490921aee8e27e92c589648c129607b0`；工作区另有文档清洗与回迁差异。本页基于源码只读核对，不表示运行、构建、模型效果或负责人验收已通过。开始实施前重核分支、源码与本页状态。

[统一入口](README.md) · [阶段设计](foundation-design.md) · [执行计划](../superpowers/plans/2026-11-22-beacon-foundation-implementation.md)

## 当前已有基础

| 所有者 | 源码可确认的能力 | 证据入口 |
| --- | --- | --- |
| Beacon扩展 | 四供应商配置、密钥、模型能力、流式对话、导师规则、工具和草稿／历史接线 | [extension.ts](../../extensions/becoder.beacon/src/extension.ts)、[provider.ts](../../extensions/becoder.beacon/src/provider.ts)、[prompts.ts](../../extensions/becoder.beacon/src/prompts.ts) |
| 原生Store／Coordinator | 所选根校验、会话占用、保存、三类运行近期队列及消费副本 | [beaconStore.ts](../../src/vs/platform/beacon/node/beaconStore.ts)、[beaconCoordinator.ts](../../src/vs/platform/beacon/node/beaconCoordinator.ts) |
| 当前编辑器页面 | 从已加载model.getValue()读取文本及dirty／版本／标题／URI，不为取材打开磁盘资源；Notebook和浏览器仍有页面投影 | [beaconPages.ts](../../src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts) |
| OJ／CPH | OJ只读取题与显示流程可分开；文件名／目录解析和已有CPH关联可复用 | [problemResolver.ts](../../extensions/becoder.oj-connect/src/problemResolver.ts)、[problemStore.ts](../../extensions/becoder.cph/src/problemStore.ts)、[browserHost.ts](../../extensions/becoder.oj-connect/src/browserHost.ts) |
| Notebook／PDF | 独立文档编辑／运行／备份、主动选区材料和已加载PDF文字读取 | [Notebook说明](../../extensions/becoder.notebook/README.md)、[PDF说明](../../extensions/mathematic.vscode-pdf/README.md) |

当前能力的详细用法见[扩展使用说明](../../extensions/becoder.beacon/README.md)，不能将下表目标行为写成当前用法。

## 必须落地的差量

| 主题 | 当前源码事实 | 已确认目标与任务 |
| --- | --- | --- |
| 采集与消费分离 | beginActivity检查根和源码，可在Blackout建立句柄；runtimeWrite却调用拒绝Blackout的store，实际写入仍会失败。消费checkScope含mode／epoch／activeId | 独立采集scope固定根身份和根选择代数，不含mode／聊天；有效根三档持续采集，无根／异常不采集，无回填。Task1–3 |
| 五类共享近期材料 | Store仅接runner／cph／notebook，现有限额10／10／30；没有本方案Get Problem／OJ队列 | Get Problem13条含题面及真实行为；四执行来源各20条，活动保护、原生结构与诚实收尾。Task1–3 |
| 实时代码与历史 | ContextTools检查发送时target.version，旧捕获进入contextSnapshots及内存map；尚非本对话10份有界队列 | 每次新主动读可取最新dirty稿，同次完整内容保存；256KiB、去重晋升、失败保队列、淘汰后分页失败。Task1、4 |
| 共享消费 | consumeRuntimeRecord复制整条记录到当前对话materials | 取消整条永久复制，只保实际工具返回；精确首次读取在本回答固定版本。Task1、5 |
| 题目与题面 | 已有解析器和CPH存储，Beacon仍以withOjPages加入打开题面／判题页 | 聚合真实Get／CPH／路径线索，LLM选题；保存题面和只读联网分开，模型联网零专门持久化。Task2、5 |
| 唯一执行事实来源 | 打开Notebook页面投影包含outputs；editNotebook.read仍可读outputs／attempt，普通文件read／search还会返回笔记JSON中的可逆base64与attempt；OJ题面／判题页面仍可读 | 移除模型自动功能页和资产工具运行字段；笔记／备份自动文件读取先投影内容、再分页／检索，失败不回原文。宿主完整备份、用户输出和内容编辑继续保留。Task5 |
| 完成工具与分支 | 已有协议记录与重放，但错误／中断、私有材料原生回退和换模型的完整目标矩阵尚待补齐 | 完成事实不重演；普通材料查有效分支，代码队列为对话范围例外；按完整模型来源清私有字段。Task6 |
| 输入预算 | provider.prepareStep主要执行fileMessages，尚无本方案实际预算关卡 | 计最终system／tools／messages／媒体，实际O只预留一次，普通每步与整理每步分别守容量。Task7 |
| 同步压缩 | 尚无本稿摘要投影实现；ChatHistory普通writer会吞保存失败，不能直接用flush当确认提交 | 有效前缀、候选隔离、确认串行提交后发布、取消／失败保原文、同普通步骤一次修复且整理不递归。Task8 |
| 综合质量 | 旧提示评估只代表旧场景与旧实现，不能证明新基础链路 | 真实入口联合回归、合成强模型观察、五站流程和负责人验收分别完成。Task9 |

## 阶段入口与验收边界

现行需求共141个稳定ID；九项任务是本阶段实施切片，不等于交付全部能力。数量、容量、材料来源和Blackout裁切已经确认；DTO、非产品容量参数、接线与测试仍按候选执行计划审阅。文档回迁只完成文档工作。

Notebook旁路的当前源码依据为[工具schema](../../extensions/becoder.beacon/src/provider.ts)、[资产读取owner](../../extensions/becoder.notebook/src/editApi.ts)、[文件读取与搜索](../../extensions/becoder.beacon/src/fileTools.ts)及[笔记序列化](../../extensions/becoder.notebook/src/model.ts)。内容投影的具体接线是工程提案，用于落实已经确认的单一事实来源，不是新增笔记存储机制。

后续实施依次完成共享存储、生产者、代码工具、题目与局部读取、协议恢复、预算、摘要、联合回归。完整工具调用可视化UI、教学记忆／dream、完整视觉和更充分的本人同题历史仍属后续。Notebook独立功能与已有用户流程是保护范围。

源码测试与类型检查、staged应用、Setup、真实站点、模型语义、负责人体验分别成立。本轮未运行产品测试、构建、API评估或真实账号操作；未形成这些层面的新通过结论。最新文档回迁核对见[文档校验记录](review/2026-11-22-document-return.md)。
