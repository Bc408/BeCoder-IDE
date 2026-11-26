# Beacon 文档入口

更新：2026-11-26。Beacon 是编辑器内可选的算法与编程导师。本轮上下文就绪、可见Notebook及源头去重已完成源码实施和回归；最新stage结果、模型回答质量与负责人真实流程验收另见[实现状态](implementation-status.md)。

先读根目录[仓库规则](../../AGENTS.md)和[产品方向](../../VISION.md)，负责人最新决定优先。按下列职责阅读，现行文档不混入已完成的实施待办。

| 文档 | 职责 |
| --- | --- |
| [信息流提示词接入与中英文语义](review/2026-11-26-prompt-information-flow-installed.md) | 当前工作树2026-11-26.4：首层环境、九工具用途／参数、条件notes／具体失败、固定ID摘要、材料与续答；模型对照待进行 |
| [上一版整套提示词与中文语义对照](review/2026-11-26-overall-prompt-refresh-candidate.md) | 2026-11-26.3审定快照；其中七主题原文在本轮保持 |
| [能力需求](prd.md) | 产品边界、141个稳定需求ID及后续能力；需求不等于已交付 |
| [总体架构](architecture.md) | 模块所有者、数据流、模型与harness分工 |
| [工具合同](tool-contract.md) | 九工具参数、结果、三来源run字段及JSON示例；含实时代码和产品知识读取 |
| [底层设计](foundation-design.md) | 三队列、采集资格、持久化、执行解耦与旧数据处理 |
| [上下文压缩](context-compaction.md) | 输入预算、同步摘要、有效分支与有界恢复 |
| [实现状态](implementation-status.md) | 当前源码、已有验证、已知缺口和待验收项 |
| [使用说明](../../extensions/becoder.beacon/README.md) | 面向用户的当前操作和可用能力 |

当前提供 `readCurrentCode`、`readProblemRecord`、`readRunRecord`、`readVerdictRecord`、`fetchProblem`、`inspectFile`、`readPage`、`browseWeb`、`readBeCoderInfo`。读题、运行、最终测评分别保留13／30／20条；代码读取没有独立快照存储。讨论对象和取材由LLM判断。readBeCoderInfo按七个固定主题读取随包产品知识和运行宿主发行版本，三模式和无工作区均可用，不读取个人配置。

**工作区决定软件采集资格，模式决定模型消费权限。** 有效根下Blackout仍采集业务记录，但模型不能列出或读取持久来源；当前可见C/C++与BeCoder Notebook内容和五站fetchProblem保持可用。现场读取含dirty、未命名及根外文档，读取前按文档身份合并多视图，不按正文去重，也不含Notebook执行结果。fetchProblem与聊天搜索开关互不影响。

应采集事实从整理到原子发布期间，独立的collectionPending在有效根三模式下阻止新请求，提示“正在保存用户行为上下文”。失败由原动作窗口右下角通知、同动作至多一次，结束等待并保留草稿；执行清理与下一次用户运行不等待保存，不排队、重试采集或自动发送。本轮源码事实不等于新stage、模型效果或真实流程验收。

| 证据与后续材料 | 身份 |
| --- | --- |
| [提示词与模型信息流统一设计](../superpowers/specs/2026-11-26-beacon-prompt-information-flow-design.md) · [实施计划](../superpowers/plans/2026-11-26-beacon-prompt-information-flow.md) | IF-D1／IP-D1已获负责人批准并按Native接入工作树；源码验证与模型效果／stage验收分别记录 |
| [信息流实现复审与修复](review/2026-11-26-prompt-information-flow-code-review.md) | 修复inspectFile非法参数导致历史不可重开、读取验证失败误报上下文变化；最终源码检查与本次stage结果分列 |
| [上一版工具与产品知识快照](review/2026-11-26-tool-information-prompt-review.md) | 2026-11-26.2源码抽取及中文对照，保留作版本追溯；当前审定文本见上表 |
| [上下文工具专项报告](evaluation/2026-11-26-context-tools-interview-report.md) · [34轮完整问答](evaluation/2026-11-26-context-tools-interview-dialogue.md) · [问题矩阵](evaluation/2026-11-26-context-tools-interview-plan.md) | 新stage隔离原生流程、3次新会话复测、8题访谈及补核；58次调用配对，工具执行、必要来源取得和回答正确性分别计量，原始选材失败保留 |
| [硬能力工程审查与修复](evaluation/2026-11-26-hard-capability-review-report.md) | 工具读取、采集发布、执行事实、会话归属和压缩请求的18项工程修复；回归、复审和本轮stage分别记录，不代表模型质量或真实流程已验收 |
| [用户行为上下文就绪与可见文档设计](../superpowers/specs/2026-11-26-beacon-context-availability-and-visible-notebook-design.md) · [实施计划](../superpowers/plans/2026-11-26-beacon-context-availability-and-visible-notebook.md) | 负责人已批准设计并授权实施，源码和回归完成；保存门禁／失败通知、Notebook平权及按文档身份去重，新stage已交付，实际体验仍待验收 |
| [工具与事实表达设计](../superpowers/specs/2026-11-26-beacon-tool-information-design.md) · [实施计划](../superpowers/plans/2026-11-26-beacon-tool-information.md) | 负责人已授权实施；九工具、最新／文件筛选、代码指纹与固定投影；实际验证和交付另列 |
| [工具清洗交付报告](evaluation/2026-11-26-tool-information-report.md) · [定向问答原文](evaluation/2026-11-26-tool-information-samples.md) | 798项回归通过、1跳过；该次交付为新stage及未启动环境，后续原生运行另见第二轮访谈 |
| [第二轮原生访谈反馈与核验](evaluation/2026-11-26-native-harness-interview-report.md) · [20轮完整问答](evaluation/2026-11-26-native-harness-interview-dialogue.md) | 新工具的真实拿题／三来源运行／dirty改稿与8主访谈、2补核；模型自述逐条核对，不冒充全功能验收 |
| [提示词调优设计](../superpowers/specs/2026-11-25-beacon-prompt-quality-design.md) · [实施计划](../superpowers/plans/2026-11-25-beacon-prompt-quality.md) | 负责人已批准Native实施；精简导师核心、工具说明及产品知识已接入，最终验证见实现状态 |
| [前轮提示质量报告](evaluation/2026-11-25-prompt-quality-report.md) · [问答原文](evaluation/2026-11-25-prompt-quality-samples.md) | 新旧冻结版本的同场景模型观察；机械成功与回答质量分别计量 |
| [原生harness访谈与核验](evaluation/2026-11-25-native-harness-interview-report.md) · [完整问答](evaluation/2026-11-25-native-harness-interview-dialogue.md) | 新stage隔离实例内的真实做题与八题访谈；保留大输入容量失败、原生编辑恢复及模型自述的反证；不是全场景验收 |
| [run容量修复报告](evaluation/2026-11-25-run-record-limits-report.md) · [模型复测原文](evaluation/2026-11-25-run-record-limits-samples.md) | 独立字段截断、32KB拒收及旧超大记录拒读；旧聊天压缩与整体教学质量不由此验收 |
| [前轮能力报告](evaluation/2026-11-24-context-tools-rebuild-report.md) · [问答原文](evaluation/2026-11-24-context-tools-rebuild-samples.md) | 2026-11-24工具重构观察与2026-11-25复审／构建历史 |
| [输出质量要点](review/2026-11-23-output-quality-improvements.md) | 已观察的问题、当前适用建议和下一步审阅依据；不是已修复声明 |
| [前轮提示词全文与中文对照](review/2026-11-25-prompt-inventory-and-translation.md) | 2026-11-25.3历史源码快照；当前工作树提示版本为2026-11-26.4，接入位置与中英文语义见上表 |
| [三项目源码研究](research/2026-11-22-compaction-comparison.md) | 固定提交研究，保留原项目事实，不能当作最新上游状态 |
| [基础评测](evaluation/2026-11-23-context-foundation-report.md) · [旧工具专项报告](evaluation/2026-11-23-tool-information-flow-report.md) · [旧专项结论](evaluation/2026-11-23-tool-information-flow-conclusions.md) | 旧架构实测证据；不用于证明新工具已经稳定 |
| [来源索引](sources.md) | 固定Git版本、历史原稿与需求来源代号 |

已被替代的工具方案、完成的执行计划和重复回迁记录从现行目录移除，原稿从Git追溯。教学记忆、资产写入、完整视觉、本人同题历史和完整工具可视化等后续需求继续保留在PRD。本轮system、工具用途／参数说明及产品主题正文统一英文，回答跟随用户语言；范例与质量判据只在评测侧。
