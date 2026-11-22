# Codex harness 阅读笔记与 Beacon 架构启发

研究日期：2026-11-21。本文是架构讨论材料，源码事实与 Beacon 建议分别陈述，不是实施计划或验收记录。

## 阅读基线

- 仓库：`C:/Users/Bc/Desktop/openai-codex-harness`，远端为 `openai/codex`。
- 更新前：`afb436df8b70bb5bc57b86d9a3e829968988cd21`，2026-10-04 的提交。
- 执行 `git pull --ff-only --no-rebase origin main` 后：`1145028ae47e8119955323d38ce34122d418f951`。
- 该提交时间为 2026-11-21 16:39:16（Asia/Shanghai），标题为 `Skip empty permissions messages in the initial context (#62933)`。本次查询的 GitHub main、更新后的 HEAD 和 origin/main 一致；拉取前后工作树均干净。
- 三个只读子任务分别查阅行为提示、压缩恢复、工具与材料边界，主任务核对实际请求装配和状态更新路径。本文检查了源码与测试断言，未执行 Rust 测试、构建或 Codex 程序。没有为本次研究发起模型调用。

## 1. 软约束以片段装配，具有来源和生效范围

**源码事实。** `PromptSlot` 区分 `DeveloperPolicy`、`DeveloperCapabilities` 和 `ContextWindow`。`PromptFragment` 把内容、分类和生产者元数据放在一起。Session 按片段的角色和位置装配请求；同一消息角色的片段可以合并，显式消息和独立片段的边界会保留。它不是把目录里的所有 Markdown 无条件拼进系统提示。

入口：[片段与槽位](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/ext/extension-api/src/contributors/prompt.rs:11)、[实际初始上下文装配](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/session/mod.rs:5219)、[合并规则](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context_manager/updates.rs:9)、[角色和边界测试](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context_manager/updates_tests.rs:86)。

**Beacon 启发。** 统一提示入口可以分别接收导师规则、当前工具说明、本轮事实、用户教学要求和会话材料。统一的是装配与责任归属，不要求把这些内容都提升到同一条高优先级指令里。内部宜保留片段的所有者、来源、适用对象与版本，为更新和压缩提供依据；具体字段尚不冻结。

## 2. 提示文本的实际来源，需要沿模型选择与配置覆盖查证

**源码事实。** 基础行为文本可来自所选模型的目录元数据或配置覆盖。`render_model_instructions` 直接返回捕获到的元数据字符串；缺失和显式空文本分别处理，字段名中的 template 不意味着有模板插值。仓库中的 Markdown 后备提示不能代表所有模型或线上产品的全部提示。

入口：[模型目录](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/models-manager/models.json:78)、[文字渲染](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/prompts/src/model_instructions.rs:7)、[模型配置覆盖](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/models-manager/src/model_info.rs:44)、[字面量测试](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/prompts/src/model_instructions_tests.rs:63)。

**Beacon 启发。** 核心教学定位由 Beacon 自己维护并始终存在于有效输入中，模型适配和工具说明另外组合。当前 Beacon 的通用导师身份与联网条件耦合，应在已确认的统一入口方案中解除：[当前装配位置](C:/Users/Bc/Desktop/BeCoder/BeCoder_maintenance/extensions/becoder.beacon/src/provider.ts:290)。

## 3. 用户纠正需要明确取代旧要求，删除也应有语义

**源码事实。** `AgentsMdState` 比较已知快照：内容未变时省略重复片段，改变时声明替换，消失时声明旧指令不再适用。基础模型指令还有专门的替换和撤销片段；具体是否使用该路径受模式与来源影响。这里更新的是宿主已知的配置状态，不是自动从自然语言提炼用户意图。

入口：[项目规则的替换与撤销](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context/world_state/agents_md.rs:44)、[覆盖不同前态的测试](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context/world_state/agents_md_tests.rs:19)、[模型规则更新片段](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context/model_instructions.rs:8)。

**Beacon 启发。** “这题保留原结构”应有题目范围；“现在直接给完整代码”可以取代此前“只给提示”的同一任务要求；“这一点我懂了”应影响后续讲解。近期先依用户原话和当前请求处理。若以后维护派生的教学状态，必须能追溯原话、识别范围和撤销，不将模型推测写成用户明确决定。

## 4. 稳定规则与变化状态分别维护，请求使用一致的快照

**源码事实。** `StepContext` 捕获本次采样的不可变设置版本及实际工具路由。初始上下文完整装配，后续以 WorldState 基线和有效历史比较，发布状态变化。需要恢复或建立新上下文窗口时再完整注入。因此，“规则始终有效”并不意味着每个工具续轮都往历史中重复追加规则全文。

入口：[请求设置与工具快照](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/session/step_context.rs:27)、[完整注入和后续更新](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/session/mod.rs:5648)、[完整与增量渲染](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context/world_state/mod.rs:653)。

**Beacon 启发。** 导师规则保持稳定；本轮对象、页面版本、可用工具和模型能力使用本次请求的真实状态。避免模型看到一套工具说明，执行时却使用另一套配置。首版可按每次请求直接重建确定输入，不必立即实现 Codex 的整套增量上下文框架。

## 5. 外部材料不能因进入上下文而变成用户指令

**源码事实。** AdditionalContext 区分 Application 和 Untrusted。前者进入开发者片段；后者在不同功能配置下编码为工具结果或带外部标记的用户片段。模型请求的部分内部元数据还会因供应商兼容性而被去除，不能把内部分类视为所有模型都能识别的强保证。

入口：[来源决定编码方式](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/state/additional_context.rs:48)、[功能分支](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/session/turn_input.rs:886)、[实际传输兼容处理](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/client.rs:1294)、[信任层级测试](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/tests/suite/additional_context.rs:193)。

**Beacon 启发。** 题面、源码注释、OJ 记录、检索结果和模型摘要保留材料身份。它们可以成为讲解依据，不能变成真实用户许可或修改教学定位。宿主记录的对象与版本元数据，也不意味着其包裹的外部正文获得指令权限。

## 6. 工具说明和执行检查是两种不同保证

**源码事实。** 工具说明给模型操作前提和恢复方法；工具计划与注册表按实际策略选择工具，未注册调用也会被拒绝。权限提示中的要求还对应独立的执行检查。测试会核对注册集合、消息编码和执行事件，不能由这些测试推定真实模型稳定服从软约束。

入口：[策略控制注册](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/tools/registry.rs:582)、[未知工具调用](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/tools/registry.rs:838)、[模型可行动错误](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/tools/handlers/mod.rs:99)、[实际权限检查](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/tools/handlers/unified_exec/preparation.rs:255)。

**Beacon 启发。** 教学深度、保留写法、如何追问、额外个人信息查询的真实用户许可等仍按既定设计由提示引导。页面/文件范围、会话归属、记录版本和资产写入条件继续由宿主执行。不新增个人信息查询许可台账或审批分类器。模型也不获得 Shell、运行学生程序或交题能力。

## 7. 可迁移的是行为原则，算法导师策略需要自己定义

**源码事实。** 随包的一些模型文本要求适应用户背景、使用普通语言、解释验证及限制、纠正误用要求、尊重用户收窄范围。模式模板还区分可通过检查获得的事实和需要询问的偏好。已检查文本没有完整的算法分级提示、答案披露或学习掌握状态策略。Codex 的代码实施目标也不同于 Beacon 的教学目标。

入口：[纠正与用户范围，gpt-6.2-sol 条目](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/models-manager/models.json:78)、[证据与实际限制，gpt-6.1-sol 条目](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/models-manager/models.json:595)、[新手解释，gpt-5.6-sol 条目](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/models-manager/models.json:1288)、[事实与偏好的区别](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/collaboration-mode-templates/templates/plan.md:77)。

**Beacon 启发。** 定义本产品的具体行为：用户要提示时只给可推进的一步；要原理时从已有理解往前讲；纠错时对准当前稿并尽量沿用原结构；用户明确要完整解法时正常提供。不能把 Codex 的“持续实施到完成”直接翻译成替学生写完题解或强制用户答题。

## 8. 压缩首先是输入组织与恢复机制

**源码事实。** 源码分别维护持久记录、活动模型历史和最终 `for_prompt()` 输入。local compact 仍需调用模型；remote V2 使用特定触发项和响应协议。不同路径的保留预算、裁剪和能力要求不同，不保证所有近期 assistant/tool 原文完整留下。

入口：[正式采样前投影](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/session/turn.rs:2148)、[local 保留项选择](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/compact.rs:733)、[手动入口分流](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/tasks/compact.rs:53)、[remote V2 触发](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/compact_remote_v2_attempt.rs:229)。

**Beacon 启发。** 继续保持原始会话和独立材料留存，压缩只生成另一份模型输入投影。四家服务的能力不同，不能默认支持 Codex 专用压缩协议，也不能照搬静默去除图片的行为。

## 9. 压缩之后恢复可信规则，不靠摘要记住规则

**源码事实。** `build_compaction_replacement_history` 使用当前 WorldState 重建初始上下文，再与压缩后的历史组合。摘要提示只负责提炼进展、决定、限制、用户偏好和下一步；摘要不是当前配置的唯一来源。工具协议归一化还处理缺失结果、孤立结果和不支持的媒体。

入口：[压缩后重建规则](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/compact.rs:90)、[摘要提示原文](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/prompts/templates/compact/prompt.md:1)、[工具协议归一化](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context_manager/history.rs:1260)、[中止结果占位](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/context_manager/normalize.rs:63)。

**Beacon 启发。** 压缩后由应用重新装配导师规则、当前工具和权限、本轮对象。保留用户原始要求的可追溯材料；摘要中的“学生已掌握”“代码已通过”仍然只是需要来源支持的陈述。完整调用关系也不证明工具结果完整，截断和失败必须保留。

## 10. 摘要安装、分支与预算也属于正确性

**源码事实。** 后台替换前会复核历史 generation、前缀长度和认证主体；过期候选不能覆盖已换过的历史，有效后缀继续保留。采样前预算检查处仍有 TODO，承认尚未完整计入待加入的用户输入和上下文更新。

入口：[替换时的校验](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/session/compaction_replacement.rs:37)、[采样前输入预算缺口](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/session/turn.rs:268)、[过期候选回归](C:/Users/Bc/Desktop/openai-codex-harness/codex-rs/core/src/compact_remote_v2_installation_tests.rs:54)。

**Beacon 启发。** 摘要绑定会话、有效分支、覆盖范围和历史版本；编辑旧消息或重新回答时使受影响摘要失效。预算应计入完整装配后的提示、当前问题、工具定义、材料与输出预留。首版同步压缩比直接引入后台候选更容易验证；阈值需要用 Beacon 的模型和材料实测。

## 对上一轮架构图的修订建议

维持“统一提示装配”这个所有者，但在其内部明确以下输入与责任：

| 输入 | 权威来源 | 更新方式 | 压缩时的处理 |
| --- | --- | --- | --- |
| 导师核心规则 | Beacon 产品配置 | 独立版本；不受联网开关影响 | 从当前配置重新装配 |
| 工具能力与说明 | 本次实际注册的工具及模型能力 | 与请求快照一致 | 按当前能力重新装配 |
| 本轮对象与证据目录 | 编辑器、执行者与 OJ 所有者 | 按页面/运行/提交版本更新 | 重新取得元数据，旧事实保持原身份 |
| 用户教学要求 | 当前会话的真实用户消息 | 尊重最新纠正与范围；派生状态可追溯 | 保留关键原话与来源，不能摘要成新许可 |
| 材料正文与旧工具结果 | 本会话实际读过的材料 | 受控读取，区分原文与推断 | 完整快照留存，按需回读 |
| 长会话摘要 | 模型生成的输入投影 | 覆盖范围与历史版本匹配才使用 | 失效可重建，不能替代原始历史 |

这些是 Beacon 的候选设计，不是对 Codex 模块的一一搬运。NoteBook 继续作为用户明确请求时的学习资产工具，工作区 tips/status/dream 仍为独立后续能力。

## 近期建议与验收材料

1. 先实现已确认的统一导师入口，把教学规则与联网及 NoteBook 提示解耦。为规则片段和模型请求保留可核查的装配信息。
2. 明确可观察的教学行为：正确指代当前稿、逐项核对改动、沿用原结构、已会内容不重复灌输、按用户意图给提示或完整解释。
3. 用同一批合成与脱敏案例做旧/新提示对照。单元测试检查装配、版本、工具集合和来源；本地 Ollama 检查实际回答。一次成功不代表稳定，固定关键案例重复观察。
4. 在上述回答质量基线上再引入压缩，复跑同一案例，额外覆盖用户撤销、旧消息编辑、重答、换模型、失败/取消、工具结果截断与图片材料。

现有 V1/V2 案例应继续保留：V1 的累加器未初始化且循环漏末项；V2 只补初始化。合格回答必须指出仍然漏末项，并说明旧 WA 属于 V1。不能让“上下文来源清楚”被误判为“模型已经看准代码”。

## 本次没有证明什么

- 公开仓库中的提示文本不是线上 Codex 的全部行为说明，也不是模型遵循率或教学效果证明。
- 已阅读的测试证明哪些结构和路径受到覆盖；本次并未执行这些测试。
- 只拉取并阅读 harness；没有修改其源码，也没有在本轮实施 Beacon 提示词、压缩或新的权限功能。
