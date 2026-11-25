# Codex、OpenCode、pi 压缩源码对照

日期：2026-11-22。本文保留三项目固定提交的历史源码证据，不声称线上最新，也未运行其测试。2026-11-24负责人已完全撤回codesnap，正文中旧Beacon队列或历史回读建议均不再作为实施合同。现行取舍见[模型输入压缩](../context-compaction.md)与[队列决定](../decisions/context-queues.md)。三项目观察与旧Beacon建议分别按其原时点解释。

## 1. 版本与证据范围

| 项目 | 上游仓库 | 固定读取 HEAD |
| --- | --- | --- |
| Codex harness | `openai/codex` | `357fe240c91563c1e6c9690bb27a2e609282d615` |
| OpenCode | `anomalyco/opencode` | `73a0eae88de47f10068a0f9dc7a743638fa3d830` |
| pi | `earendil-works/pi` | `9c4652688590abb836b40ebd1e4725ecf9a7c7d1` |

三套本地工作区检查时均干净。本轮按上述固定版本研究，没有拉取或声称已覆盖线上最新提交。尝试查阅上游网页未返回可读正文，因此结论以本地固定提交的真实源码为依据，不把网页查询计作成功核验。下文行号相对于这些版本；曾读到的旧函数名、默认值及路径不直接套到本轮。

## 2. Codex harness

### 触发与计量

- `codex-rs/protocol/src/openai_models.rs:574`：自动压缩额度默认是模型原始 context window 的 90%；明确配置存在时取二者较小值。可用完整上下文另按 effective percentage 计算，默认 95%，两者不是同一额度。
- `codex-rs/core/src/session/context_window.rs:56`：auto scope 支持 total 与 body_after_prefix；后者扣除本窗口初始前缀，但完整有效上下文上限仍独立兜底。不能只统计用户对话正文而忽略总窗口。
- `codex-rs/core/src/context_manager/history.rs:1234`：使用最后一次有效请求的 token usage，再估算这次 usage 之后新进入的历史；保留 reasoning 的计量身份。这不是把所有请求累计消耗当作当前窗口占用。
- `codex-rs/core/src/session/turn.rs:1751`：新轮采样前检查；同文件 `:742–853` 在采样及工具续轮结算后检查，达到阈值且需要后续请求时整理。
- 该版本 `turn.rs:268` 仍有 TODO：pre-turn 检查发生在新输入和 context updates 记录之前，需进一步估算即将到来的内容。因此“有 pre-turn 检查”不等于覆盖全部新 hook 材料。

### 额外路径及局限

- `turn.rs:933` 存在可配置的 post-turn 整理；`config/mod.rs:4814` 默认百分比为 0，不能当作必定后台整理。
- `features/src/lib.rs:2533` 的 async_compaction 为开发中功能，默认关闭；`features/src/feature_configs.rs:692` 的预启动阈值默认 65%，仅填阈值不会启用功能。
- `core/src/session/async_compaction.rs:42` 还要求 remote compaction V2 能力，并排除 TokenBudget 路径。后台结果安装要检查历史 generation、前缀长度、模型／身份关联并保留实时后缀，见 `session/compaction_replacement.rs:35`。
- `turn.rs:1798` 换小模型时可用上一模型压缩旧上下文；这不能直接覆盖 Beacon 已确定的“使用当前会话选定模型”规则。

### 摘要、失败和历史

- 提供方能力决定 local summary 或 remote V2，另有不做摘要的 TokenBudget reset 分支；不能把整个 Codex 统一描述为某个本地摘要提示。
- 本地路径 `compact.rs:267` 在临时历史上整理；摘要请求自身溢出时移除最早条目后重试，直到不能再缩。普通瞬错按 provider retry policy 处理。移除输入属于其降级规则，不能假称这些被移除内容已被模型概括。
- `compact.rs:456` 安装 replacement history 并重估 token；`session/mod.rs:4933、5092` 记录替换历史及恢复信息。后台安装还核对捕获前缀 generation，旧结果不会直接覆盖已变化历史。
- `context_manager/history.rs:1260` 对调用／结果配对和不支持的媒体另作规范化。Beacon 应保护真实已完成工具事实，不能照搬“补缺失 output”来伪造成功。
- 源码测试包括 `core/tests/suite/compact.rs` 的 `failed_compaction_preserves_history_after_restart`、`auto_compact_runs_after_resume_when_token_usage_is_over_limit`、`snapshot_request_shape_mid_turn_continuation_compaction`、`pre_sampling_compact_runs_on_switch_to_smaller_context_model`；以及 `session/compaction_replay_tests.rs` 的重放一致性。本轮仅读测试，未执行。

## 3. OpenCode

### 触发与计量

该版本入口是 `calculateCeiling` 与 `due`，不是旧文档常见的 isOverflow。`packages/core/src/session/compaction.ts:1151` 的默认公式为：

```text
W = input、context 均非零时取 min(input, context)，否则取其中非零者
reserve = max(floor(W × 0.15), W >= 32000 ? 16000 : 0)
ceiling = W - reserve
due = measured + estimated >= ceiling
```

W 未知时阈值为无穷；有效 buffer 配置替换默认 reserve，旧 reserved 字段经配置规范化映射。**输出额度不直接进入这个触发公式**，实际请求和摘要输出另算，见 `session/model-request.ts:101` 与 `compaction.ts:1209`。

- `compaction.ts:1120` 用最近同提供方且有效的 assistant usage 为锚，加入尚未被计量的工具结果与后续消息；没有锚点则估算系统、工具和消息。主完整请求的精确 usage 复用还检查模型、variant、agent 身份，见 `:1188`。
- 字符估算约为字符串长度／4，图片与 PDF 使用固定估计；这是实现中的近似，不适合作为 Beacon 中英文、代码、图片都准确的保证。
- `session/runner/llm.ts:249` 在每个 step／重试构造主请求前触发；检查先于后续 request hook，所以 hook 增量仍可能进入溢出恢复。

### 工具边界、摘要与恢复

下面有关文本尾部、摘要模型与正文整理的描述针对文本摘要路径。`compaction.ts:311` 另有提供方 native compaction 分支，不能将两条路径的正文形态和可用能力等同。

- `session/runner/step.ts:183` 等待当前流和本地工具结算，再推进下一步。尾部切点退到用户边界以保护调用／结果，见 `compaction.ts:1022`；单个超大 exchange 也可能全部摘要，不保证整个当前用户轮原样保留。
- 尾部使用序列化文本，reasoning 和附件正文可被省略，工具输出受进一步限制；不能把它称为完整原生协议重放。
- 默认使用当前模型，可配置 compaction agent 模型；正文摘要只消费输出，不执行普通工具。旧摘要并入新摘要，新历史优先。有效历史从完成的 checkpoint 重建摘要、保留尾部及后续消息。
- `runner/step.ts:202`：当前 step 尚未开始输出才透明修复上下文溢出；reasoning／工具参数开始也算输出。`runner/llm.ts:378` 在成功压缩恢复后关闭该 step 的再次恢复，避免无限重试。
- 摘要请求自身溢出时按 85%、70%、50%、35% 四档缩小请求；工具正文裁剪、转文本和舍弃旧 exchange 属程序降级规则，见 `compaction.ts:633`。这会牺牲输入覆盖，不能不加区分地套到真实代码凭证。

### 提交与后台路径

本小节的文本摘要校验及后台预摘要描述也限于文本摘要路径；native compaction 在 `compaction.ts:355` 跳过这类后台预摘要。

- 只有完整摘要通过结束校验后才发布有效 checkpoint；失败、取消、截断不提交流式草稿。重启会把遗留 running 整理标为 interrupted。
- 自动与后台默认开启，后台预摘要还有提前启动、同锚点去重、失败暂停、尾部大小和结果可用性检查。这是源码事实，不代表 Beacon 应照搬后台方案。
- 最近刚完成 checkpoint 时跳过立即重压；本轮未找到摘要必须缩短特定比例的硬校验。
- 该版本配置明确不支持旧 prune。工具输出有确定性的行数／字节预览及完整文本文件化机制；原始历史仍用于重建，所查路径没有“LLM 判断后物理删除代码快照”的契约。
- 已读 `packages/core/test/session-compaction.test.ts:387`、`session-runner.test.ts:2623、3293、3977、4971` 对应阈值、等待工具、有界缩小、二次溢出和重启；未执行测试。

## 4. pi

### 触发、估算和时机

- `packages/coding-agent/src/core/compaction/compaction.ts:126` 默认 enabled=true、reserveTokens=16384、keepRecentTokens=20000。
- 主动触发严格为 `contextTokens > contextWindow - reserveTokens`。有效 usage 优先 native totalTokens，否则累加 input/output/cacheRead/cacheWrite；错误、取消、全零 usage 不作锚点。没有有效 usage 则全量估算，已有锚点则加后续消息估计。文本约按字符／4、图片用固定 token 值。
- `agent-session.ts:2011` 的旧上下文检查在新 prompt hook／新消息构造前；agent 结束后也检查。`agent-session.ts:831` 和 agent-loop 的 prepareNextTurnWithContext 在工具批次结束、下一次 assistant 请求前检查；虚拟模型另在路由后检查实际模型。不能把所有普通模型入口概括为“最终出站内容每次已完整检查”。
- 32768 窗口配上默认 reserve，触发线为 16384；默认近期尾部目标却是 20000，尚未计摘要，说明固定大数不能直接搬到 Beacon 默认配置。

### 切点、摘要与恢复

- 切点避免把 toolResult 单独留在开头；超大结果保留前一条调用。可以切开当前用户轮，把前缀转为 Turn Context 摘要；keepRecent 是目标，不是最终请求硬上限，见 `compaction.ts:446、789`。
- 摘要使用当前模型和独立的整理请求，不提供执行工具。输入来自当前有效投影，旧摘要作为增量材料。切开用户轮时，历史和轮前缀可能分别摘要后合并，不能据此声称一定单次请求完成。
- `agent-session.ts:3173` 的溢出恢复会先写入 context_edit 忽略失败尝试，再压缩继续；某些 length 响应也可进入这条恢复。连续失败只允许一次修复，但正常 toolUse 或新用户消息可重置预算，所以不是整个用户问题绝对只压一次。
- 摘要自身瞬错默认另有最多三次重试；截断摘要拒绝提交。源码没有保证压后必定低于触发线的最小收益检查。

### 提交和持久化

- `agent-session.ts:3345` 顺序是完整摘要、取消检查、追加 compaction、刷新有效投影、发布结束通知。
- `session-manager.ts:476、1182` 保留原始 JSONL，追加摘要和切点，从最新摘要、保留尾部及后续条目重建输入；写入失败会回滚内存中的追加。事件通知本身不是独立持久日志。
- 摘要失败或提交前取消不追加新摘要，但溢出恢复已追加的 ignore 编辑不自动回滚；Beacon 不能概括照搬为“一切失败都完全无状态变化”。
- 所查路径没有让 LLM 物理删除代码正文。测试源码覆盖同轮大工具结果、恢复预算重置、失败保留编辑、截断拒存；未执行，见 `test/suite/agent-session-compaction.test.ts:476`、`agent-session-boundaries.test.ts:780、1033`、`regressions/7048-compaction-truncated-summary.test.ts:40`。

## 5. 对 Beacon 的可用结论

1. 预算应面对本次实际有效输入，结合有效 usage 与新增差量；不能用累计费用、文件大小或消息条数替代。
2. 需要给下一次模型调用留输出与整理余量；各项目额度定义不同，不能直接比较一个百分比或照抄固定 16K／20K。
3. 工具批次结算、协议闭合后才整理，保留能继续工作的近期材料；同一用户轮内部也需要有限整理能力。
4. 溢出恢复必须限定次数、限定当前失败 step，不重复执行已经完成的工具；摘要本身不收敛时要显式停止。
5. 原始聊天、有效模型投影、可淘汰快照是不同对象。Beacon压缩只返回摘要，代码队列按容量自动淘汰；所查三项目均不提供由LLM物理删除代码快照的可照搬契约。
6. Beacon首版采用同步整理，减少摘要发布与有效输入变化的并发窗口。后台压缩需要额外的版本安装和实时后缀保护，不能只启动一个 Promise 即宣称可靠。

## 6. 上游定位入口

- Codex：`https://github.com/openai/codex/blob/357fe240c91563c1e6c9690bb27a2e609282d615/codex-rs/core/src/session/turn.rs`
- Codex 额度：`https://github.com/openai/codex/blob/357fe240c91563c1e6c9690bb27a2e609282d615/codex-rs/protocol/src/openai_models.rs`
- OpenCode：`https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/compaction.ts`
- pi：`https://github.com/earendil-works/pi/blob/9c4652688590abb836b40ebd1e4725ecf9a7c7d1/packages/coding-agent/src/core/compaction/compaction.ts`

以上是固定提交的原生源码，便于复查。具体结论对应前文路径和行号，不以产品文档或旧 issue 代替源码。
