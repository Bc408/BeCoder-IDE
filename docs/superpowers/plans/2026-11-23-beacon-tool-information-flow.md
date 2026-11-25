# Beacon 工具信息流专项实施计划

> 历史计划（2026-11-24标记）：保留前轮任务和验证范围，不继续作为新架构实施授权。旧五producer、代码队列与字段组合由[新工具设计](../specs/2026-11-23-beacon-tool-interface-simplification-design.md)覆盖，下一轮须另写计划。

> 执行：Native，主代理持续实施；评测材料可由边界明确的辅助代理完成，最终独立只读审阅。本轮负责人已明确“确认推进本专项能力迭代”，不另设例行任务确认。

**目标：** 改善模型调用、理解和补读上下文工具的可靠性，形成真实DeepSeek基线／候选对照及干净stage。
**架构：** 沿ContextTools、Provider与原生owner；共享小型工具契约，改局部投影／续读／错误说明，不增加存储或讨论对象绑定。
**技术：** TypeScript、AI SDK7、Node tests、现有Store／Coordinator、DeepSeek Flash。
**设计：** [已批准专项方案](../specs/2026-11-23-beacon-tool-information-flow-design.md)。

## 全局约束

保留当前Beacon_Next dirty候选；不自动提交、推送、Setup或发布。Get13条、四执行来源各20条、对话代码10份／262144 UTF-8字节保持。Blackout持久消费关闭，正常根采集持续；不增加源文件写入、执行、交题、镜像队列或永久绑定。代码读存同次，保存失败保正文；共享凭证本回答固定，代码快照分页不增保护。压缩只兼容工具，不改触发／恢复／格式策略。API只用合成材料、凭证本机读取且不记录。

## Review Focus

- CPH仅跑第2例、显式空expected／actual、19位整数，不能以batch index或Number替换原文（Task2）。
- 已完整保存但只返回一页、未保存续页遇改稿、快照淘汰，不能混版或增加隐式保存（Task2）。
- 受限压缩工具和Blackout不可借contract／continuation扩大能力（Task1、2）。
- 并行首次读同ref在更新／取消时，固定前失败与固定后混版分开（Task2）。
- 基线bundle必须冻结全部生产owner；新旧返回均按模型实际收到内容评分，末轮成功不掩盖中途失败（Task0、4）。

## Task0：冻结候选、评估器与案例

文件：`tmp/beacon-tool-flow/`新证据目录；复用旧runner的真实生产链但不覆盖旧文件。

- [x] 记录HEAD／dirty状态、参与owner／锁文件SHA256，打包独立baseline runner及其metafile；确认无外部生产TS动态依赖。
- [x] 固定60案例（10组各4开发＋2新保留）及8条12轮轨迹；校验计数、身份、原始题意和禁止行为。
- [x] 评估器覆盖新旧save／snapshotSave、逐调用参数／选择范围、每轮状态；先离线红灯／绿灯，保留人工裁判身份。
- [x] 原基线在产品变更前冻结，后续只能从不可变bundle执行；建验证命令台账。

## Task1：共享参数契约与具体错误

文件：新增`src/contextToolContract.ts`及测试；修改`contextTools.ts`、`provider.ts`、`compaction.ts`、build.mjs／package.json必要测试入口。均在Beacon扩展内。

接口：`contextToolSchema(operations: readonly string[])`提供JSON schema；`contextInputIssues(value: unknown, operations?: readonly string[]): ContextInputIssue[]`提供字段级诊断。ContextInputIssue包含field与固定message，不回显未获授权内容；仅合法输入进入原操作。

- [x] 先测缺operation、错类型、负revision／offset、非法part与组合、无版本续页、受限操作；断言无native调用、返回具体issues。
- [x] 运行定向测试见红；实现共享schema／执行校验，保持operation不猜填，错误码不变。
- [x] Provider／compaction使用同源schema和描述；分别测受限操作、真实SDK出站及错误结果配对，避免schema拦截导致孤儿结果或空答。
- [x] 运行拥有者类型／构建／测试及lint，记录绿灯。

## Task2：局部视图、身份、分页与一致性

文件：`contextTools.ts`、`test/context.test.ts`，必要时contract测试。
接口：保留ContextOutput核心正文／来源／分页；新返回`selection`、`availableParts`、`continuation`和`snapshotSave`，不改native DTO或磁盘格式。

- [x] 红灯覆盖CPH sampleIndex2 all的input／expected／result原文、空字段、流与判词；实现同版组合视图，整轮all保留原行为。
- [x] 红灯覆盖完整快照／局部返回、保存失败、超限、Blackout；实现snapshotSave与带身份的合法continuation，历史协议不改写。
- [x] 红灯覆盖page／record／problem的selector与分页；availableParts只从已授权本版材料导出，不补读不推断。
- [x] 用显式屏障测同ref并行首读及取消／更新；复现后才最小修fixed读取，固定前失效不伪造成功，不加产品等待队列。
- [x] 通过相关类型／构建／测试，字节保真、范围、模式、分支、预算回归全部通过。

## Task3：线索与说明磨合

文件：`contextTools.ts`、`prompts.ts`及相关测试。

- [x] 测problemHints接口可用与有匹配分开；默认已存和显式刷新有不同观测，无Get／Import或持久副作用。
- [x] 改导师取材说明：运行读凭证、当前读新稿、对照读所需版本、概念不强制工具；补读优先，冲突才澄清。
- [x] 说明snapshotSave及旧协议save均为对话快照；正文默认少元数据、少整稿、少局限报告，完整解答请求保留。
- [x] 小批真实DeepSeek锚点先比较仅说明／工具实现／合并改动；记录得失，连续两轮无可复核收益冻结相关模型项。

## Task4：冻结对照、review与交付

- [x] 基线／最终候选60项各5次，共600槽位；48轨迹／576轮；并发先4，模型／参数相同且分块交错。
- [x] 启用新保留集前冻结候选；旧128×5＋12×3作保护回归，已知压缩失败独立记录。
- [x] 分别报告首次合法、具体错误后纠正、取材充分、语义、全轮连续、外部失败与冻结瓶颈；关键负例人工复核、通过样本抽审，不重跑语义失败刷分。
- [x] 最终独立只读review，修具体问题并重跑受影响检查；源码、模型与负责人验收分别记录。
- [x] 最终客户端typecheck、统一OI扩展编译，按改动加原生／分层；写报告、原始问答和证据包。
- [ ] 保留旧stage与个人数据，构建一次干净Windows stage（标准data工具链保留）；成功后停止交付，不启动GUI／Setup或Git操作。

## 验证

先预检真实入口，源码／扩展检查120秒，stage300秒。Beacon命令：`npm --prefix extensions/becoder.beacon run typecheck`、`run build`、`test`、`run lint`；根：`npm run typecheck-client`、`npm run compile-oi-extensions`。每次红灯、失败、修正和退出码写本地台账，不使用`npm run compile`做类型检查。评估器命令在其落地后记录精确入口；不把缺依赖／脚本错误当模型或源码结果。

自查：目标、17项质量要点中本轮工具范围、身份／权限／旧协议／分页／压缩限制及对照分母均有任务归属；不将暂缓的摘要策略纳入本轮隐式改动。API费用不作为覆盖裁剪条件，能力瓶颈照录。

最终冻结为candidate-final-3；先前被review否决的中间批次保留于rejected目录，不充当最终槽位。上述勾选表示执行／证据完成，不是所有质量目标达标。正式新旧场景语义265/295→261/295，连续轨迹18/24→21/24；不据局部改善宣称整体提升。源码检查、原生保护、分层和统一扩展编译已通过；证据包与最终stage仍按最后交付门完成，实际结果以本轮台账及stage-result.json为准，构建成功后停止，不为勾选末项另改文件。
