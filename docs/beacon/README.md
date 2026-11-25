# Beacon 文档入口

更新：2026-11-25。Beacon 是编辑器内可选的算法与编程导师。现行工具底座已完成源码实施；模型回答质量和负责人真实流程验收另见[实现状态](implementation-status.md)。

先读根目录[仓库规则](../../AGENTS.md)和[产品方向](../../VISION.md)，负责人最新决定优先。按下列职责阅读，现行文档不混入已完成的实施待办。

| 文档 | 职责 |
| --- | --- |
| [能力需求](prd.md) | 产品边界、141个稳定需求ID及后续能力；需求不等于已交付 |
| [总体架构](architecture.md) | 模块所有者、数据流、模型与harness分工 |
| [工具合同](tool-contract.md) | 九工具参数、结果、三来源run字段及JSON示例；含实时代码读取 |
| [底层设计](foundation-design.md) | 三队列、采集资格、持久化、执行解耦与旧数据处理 |
| [上下文压缩](context-compaction.md) | 输入预算、同步摘要、有效分支与有界恢复 |
| [实现状态](implementation-status.md) | 当前源码、已有验证、已知缺口和待验收项 |
| [使用说明](../../extensions/becoder.beacon/README.md) | 面向用户的当前操作和可用能力 |

当前提供 `readCurrentCode`、`readProblemRecord`、`readRunRecord`、`readVerdictRecord`、`fetchProblem`、`inspectFile`、`readPage`、`readMaterial`、`browseWeb`。读题、运行、最终测评分别保留13／30／20条；代码读取没有独立快照存储。讨论对象和取材由LLM判断。

**工作区决定软件采集资格，模式决定模型消费权限。** 有效根下Blackout仍采集业务记录，但模型不能列出或读取持久来源；当前可见C/C++代码和五站fetchProblem保持可用。fetchProblem与聊天搜索开关互不影响。

| 证据与后续材料 | 身份 |
| --- | --- |
| [最新能力报告](evaluation/2026-11-24-context-tools-rebuild-report.md) · [问答原文](evaluation/2026-11-24-context-tools-rebuild-samples.md) | 2026-11-24模型观察与2026-11-25复审／构建分开记录 |
| [输出质量要点](review/2026-11-23-output-quality-improvements.md) | 已观察的问题、当前适用建议和下一步审阅依据；不是已修复声明 |
| [三项目源码研究](research/2026-11-22-compaction-comparison.md) | 固定提交研究，保留原项目事实，不能当作最新上游状态 |
| [基础评测](evaluation/2026-11-23-context-foundation-report.md) · [旧工具专项报告](evaluation/2026-11-23-tool-information-flow-report.md) · [旧专项结论](evaluation/2026-11-23-tool-information-flow-conclusions.md) | 旧架构实测证据；不用于证明新工具已经稳定 |
| [来源索引](sources.md) | 固定Git版本、历史原稿与需求来源代号 |

已被替代的工具方案、完成的执行计划和重复回迁记录从现行目录移除，原稿从Git追溯。教学记忆、资产写入、完整视觉、本人同题历史和完整工具可视化等后续需求继续保留在PRD。提示词优化专项尚未实施。
