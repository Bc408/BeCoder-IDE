# Beacon 文档入口

更新：2026-11-24。负责人允许工具设计0.4收敛，现已形成[新实施计划](../superpowers/plans/2026-11-24-beacon-context-tools-rebuild.md)，补齐九工具工程接线、三个队列、Notebook优化、旧数据和验证范围；负责人已确认本会话实施，当前候选源码及分项结果见实现状态；设计、源码、模型与桌面验收分别记录。

**本轮审阅主文：[工具设计：业务能力与记录底座](../superpowers/specs/2026-11-23-beacon-tool-interface-simplification-design.md)。** 文件名保留原日期，正文按2026-11-24决定重写。旧操作并集、快照和R01–R06退出；新稿已承接三个独立记录工具、可见分屏整稿、按程序入队、终态去重及8KiB输出。

## 阅读顺序

| 顺序 | 文档 | 职责 |
| --- | --- | --- |
| 1 | [工具设计审阅稿](../superpowers/specs/2026-11-23-beacon-tool-interface-simplification-design.md) | 本轮已批准的业务能力、记录底座与工程接口 |
| 2 | [总体架构](architecture.md) | harness／模型分工、所有者和数据流 |
| 3 | [底层阶段设计](foundation-design.md) | 本轮建设范围与工程承接 |
| 4 | [完整能力需求](prd.md) | 产品主文、稳定验收ID及后续能力 |
| 5 | [实时代码读取](code-reading.md) | 当前代码只读，独立快照已撤回 |
| 6 | [模型输入压缩](context-compaction.md) | 同步摘要、预算、有效分支与有界恢复 |
| 7 | [实现状态与差距](implementation-status.md) | 当前候选与新设计的差距 |
| 8 | [本轮实施计划](../superpowers/plans/2026-11-24-beacon-context-tools-rebuild.md) | 已收敛设计的工程任务、兼容策略、验证与停止条件；已获实施批准 |
| 使用 | [Beacon使用说明](../../extensions/becoder.beacon/README.md) | 当前源码，不作为新架构已实施证明 |
| 本轮结果 | [实施与能力报告](evaluation/2026-11-24-context-tools-rebuild-report.md) · [问答原文](evaluation/2026-11-24-context-tools-rebuild-samples.md) | 源码、有限模型观察与明确缺陷分别记录 |
| 追溯 | [队列决定](decisions/context-queues.md) · [历史来源](sources.md) · [固定版本研究](research/2026-11-22-compaction-comparison.md) | 最新决定与历史证据身份 |

先读根目录[仓库规则](../../AGENTS.md)与[产品方向](../../VISION.md)。负责人最新决定优先。

## 当前设计

| 能力／数据 | 当前决定 |
| --- | --- |
| 当前代码 | readCurrentCode取得所有当前可见分屏C/C++页面的完整正文、文件名和路径，含dirty与未命名页面；未命名路径为null，不读后台标签、不额外存副本 |
| problem | 当前.beaconWork共享13条，记录五站读题行为；按problem（oj＋problemId）与filePath共同去重，相同则删除旧项、新ID和新viewedAt入队尾；不同路径分别占位 |
| run | 三来源共用30条，每份程序一次编译及关联input为一条，结束后入队不去重；编译与程序输出合计8KiB；目录和正文不带题目 |
| verdict | 最终完整结果20条，同站同题实际提交代码完全相同替换旧结果入队尾；缺代码照常保存并跳过去重 |
| 题面 | fetchProblem按oj＋problemId联网取五站题面，独立聊天搜索开关，不新增专门持久化 |
| 通用能力 | inspectFile、readPage、readMaterial、browseWeb保留；不足时沿原权限兜底 |
| 输出内容写入 | editNotebook退出模型工具，后续另行设计，不影响Notebook独立使用 |

三个独立记录工具readProblemRecord／readRunRecord／readVerdictRecord已确定：空参按需列简短目录，带ID读完整持久记录，不另设目录工具，不增加part／分页参数。记录加入后超模型容量走既定同步压缩，不再次缩短结果。

codesnap全部撤回，普通历史、运行稿与提交稿保各自身份。工具能力共9项；五站规范题号和run字段基线已收敛，其余工程表达随新实施计划整体审阅。run不保存运行限制配置，CPH仅编译不记录。

Notebook执行优化独立于Beacon采集：点击批量时固定本次代码和input，同代码块编译一次、input各自独立进程；失败继续其他input／代码块，用户停止才结束批次。程序块从1计数，仅数C/C++；涉及N个程序形成各自run记录，覆盖此前整个点击只入一条的中间约定。采集适配器消费执行事实，不控制执行或清理。

## 工作区与模式

**工作区决定软件是否采集，模式决定Beacon能否消费持久来源。**

| 状态 | 软件采集problem／run／verdict | Beacon消费持久来源 |
| --- | --- | --- |
| 未选根／根异常 | 不采集、不写替代位置、之后不补采 | 不可用 |
| 有效根＋Blackout | 持续 | 关闭目录和读取，不建镜像队列 |
| 有效根＋Spot／Flood | 持续，始终归当前合法根 | 按权限可读 |

各模式按页面权限读取当前代码；fetchProblem独立搜索开关，browseWeb依该开关。讨论对象由LLM结合用户提问和实际材料判断，没有发送时绑定或上轮对象。

## 当前实现与历史

本轮基于本地备份74d09ef4完成九工具和三队列，并完成复审修复；旧代码快照及模型写入口已退出。fetchProblem活动使用工具名显示，普通browseWeb保留原文案；源码、模型与桌面验收的实际边界见[实现状态](implementation-status.md)。旧[底层计划](../superpowers/plans/2026-11-22-beacon-foundation-implementation.md)与[工具专项计划](../superpowers/plans/2026-11-23-beacon-tool-information-flow.md)仅保留历史身份，不能继续执行为本轮方案。

[前轮结论](evaluation/2026-11-23-tool-information-flow-conclusions.md)、[完整报告](evaluation/2026-11-23-tool-information-flow-report.md)和[基础报告](evaluation/2026-11-23-context-foundation-report.md)保原始统计与局限，不改写成新设计验证。[输出质量要点](review/2026-11-23-output-quality-improvements.md)中的教学表达和事实理解仍可参考，快照相关建议已失效。

负责人已确认Native实施；源码、设计与评测材料纳入本次正式归档，具体提交以Git历史为准。负责人真实流程验收另行记录；提示词优化专项尚未实施。
