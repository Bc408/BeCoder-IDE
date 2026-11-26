# Beacon Prompt Information Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已批准的信息流设计接入Beacon，使模型在相应位置和时机取得含义准确的环境、工具、结果与历史上下文。

**Architecture:** 保留现有业务owner、九工具与三队列，在扩展内分离来源事实、结果短释义和模型投影；普通回答、摘要与续答复用实际投影与媒体准备。摘要声明由实际fixed集合生成，源头与出站校验继续由原工程边界执行。

**Tech Stack:** TypeScript、现有AI SDK 7.0.111、Node.js测试、esbuild、PowerShell／Python文档与验证台账；不新增依赖。

**Spec:** [已批准IF-D1](../specs/2026-11-26-beacon-prompt-information-flow-design.md)，含其四份英文／中文轮次附件。日期2026-11-26，计划`IP-D1`。负责人已批准设计及本计划、选择Native并授权实施；基线为`Beacon_Next@eb48d147`的`2026-11-26.3`，工作树已接入`2026-11-26.4`。最终状态见[接入记录](../../beacon/review/2026-11-26-prompt-information-flow-installed.md)。

## Global Constraints

- 核心：**设计好信息出现的位置、时机和含义，让LLM自然取得当前需要的上下文。** 不以删字数、调用次数或固定调用顺序代替效果。
- 保留现有维护checkout与dirty文档，不自动切分支／创建worktree、不删缓存或依赖、不自动提交或推送。实施启动时重新核对HEAD／dirty；出现无关修改则保留并单独分类。
- 工作区控制采集，模式控制模型消费；problem13／run30／verdict20；run源码8192、各输入／期望／编译和程序stream4096、error1024 Unicode码点；单条32768 UTF-8字节拒收均不变。
- 普通工具名称、参数接受集合、权限、现场范围和执行事实不变；不新增快照、读取hook、讨论对象绑定、存储、模型写入／运行／登录／提交能力。
- 目标提示版本`2026-11-26.4`；system、工具与结果释义英文，中文只用于审阅；七主题原样保留。
- 保原UI码、FileOutput.error字符串及旧协议；结构化error只在新模型投影。旧交换不重写、不重演、不补生成notes。
- 摘要同模型、闭合工具切点、20步共享上限、90%触发／60%目标、一步一次恢复保持；60%未传给生成器的已知差距不在本轮解决。
- 宏严格保留`#ifndef DEBUG`／`#define debug`／`#endif`，不改为可变参数宏。
- 本计划默认交付扩展源码、bundle、离线回归与当前提示审阅材料。付费模型对照、完整stage、GUI／账号操作、Setup／Release和Git发布另按用户后续授权执行，不因本计划批准自动运行。

## Review Focus

1. 健康根Blackout仍报告采集资格，模型没有持久记录读权；无根与未知不混淆（Task 4）。
2. 即时、步骤封口、完成工具留存及续答对同次新结果保持同义；旧FileOutput与旧error-text不被改写（Tasks 1／3／7）。
3. SDK参数拒绝不会进入execute，且可能绕过toModelOutput；必须进入安全模型反馈，取消不造完成事实（Task 3）。
4. 新旧截断、来源集合缺失、空队列与预算失败分别表达，不承诺不存在的续读（Tasks 2／5）。
5. 摘要只声明真实kind＋fixed ID，图片和用户修正经过压缩／续答／换模型仍保归属，弃分支不回流（Tasks 6／7）。

## 1. 文件职责与依赖

下表路径相对仓库根`C:/Users/Bc/Desktop/BeCoder/BeCoder_maintenance`。各Task中的`src/...`、`test/...`短路径相对`extensions/becoder.beacon`；docs路径仍相对仓库根。

| 文件 | 变化与职责 |
| --- | --- |
| 新增`extensions/becoder.beacon/src/toolModelOutput.ts` | 纯模型结果投影、统一失败对象，以及仅匹配本次新工具ID的SDK失败结果替换 |
| 新增`extensions/becoder.beacon/src/toolResultNotes.ts` | 按实际来源、字段和分支生成英文短释义，无I/O、无LLM调用、无跨轮状态 |
| `extensions/becoder.beacon/src/fileTools.ts` | 原安全分类点保留可选failureCode，复用safeFileError；其余文件行为不变 |
| `extensions/becoder.beacon/src/contextTools.ts` | 宿主scope最小投影、确切失败分类、摘要真实固定ID出口；保execute授权与记录一致性 |
| `extensions/becoder.beacon/src/recordProjection.ts` | 保记录／目录事实投影，只有必要时将已知形态交notes，禁止把notes写入记录 |
| `extensions/becoder.beacon/src/webTools.ts` | 记录本次来源集合预算省略事实；模型包装沿共享投影 |
| `extensions/becoder.beacon/src/provider.ts` | 工具描述、出站／已完成事实／协议共用投影，SDK新失败正规化、媒体归属与计量 |
| `extensions/becoder.beacon/src/prompts.ts`、`contextToolContract.ts` | 审定核心、包装和九工具／参数文字，独立普通与摘要声明 |
| `extensions/becoder.beacon/src/compaction.ts`、`session.ts`、`attachments.ts` | 摘要／续答／材料文字及接线，原历史有效性与JSON合同不变 |
| `extensions/becoder.beacon/src/context.ts` | 原guardRead失败补同一个安全原因码；不改scope检查或运行门禁 |
| 现有`extensions/becoder.beacon/test/*.test.ts` | 扩充所属测试；不新增测试入口或改build.mjs、package脚本 |
| Beacon现行文档与四轮附件 | 实施后同步实际文本／状态，保历史访谈与旧版本快照 |

纯类型依赖以`import type`连接，避免新投影模块与session／compaction／webTools形成运行循环。保`session.fileModelOutput`、`webTools.webModelOutput`现有导出兼容；它们可转导出共享实现。新文件头与import风格先看同目录两份近邻。

依赖顺序：Task 1→Task 2→Task 3；Task 4依赖1／2／3；Task 5依赖1／2；Task 6依赖2／3／4；Task 7依赖3／4／6；Task 8整体收口。共享Provider与ContextTools多，不同时让不同worker写这些文件。

## 2. 固定验证入口与证据规则

后续实施每步先写有行为意义的失败回归，使用本节确切入口，记录失败，再最小实现、重建和重跑。首轮红测试通过现有public API（FileTools.execute／fileModelOutput／ContextTools／createGenerator等）观察，未存在的新字段用Reflect.get或测试侧未知结果窄化，不先导入尚未创建的helper，避免用类型／模块缺失代替行为失败。文案搬移使用既有请求装配测试，不为每句文案新建镜像测试。每任务末作只读review，修复具体发现再重跑受影响检查；不自动逐任务commit。

| 检查 | cwd | 确切命令 | 外部timeout／副作用 |
| --- | --- | --- | --- |
| 类型 | `extensions/becoder.beacon` | `npm run typecheck` | 120秒，noEmit |
| owning build | 同上 | `npm run build` | 120秒，owner生成dist／dist-test；不直接编辑产物 |
| 任务聚焦测试 | 同上 | 见各Task的`node --test`命令 | 120秒，合成fetch，不连接真实API |
| 完整回归 | 同上 | `npm test` | 120秒，现有全套；不预填通过数量 |
| strict lint | 同上 | `npm run lint` | 120秒，零warning |
| 文档 | 仓库根 | `pwsh -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1` | 120秒，只校结构 |
| 差异 | 仓库根 | `git diff --check` | 30秒，未跟踪文档另检查UTF-8／空白／链接 |

已只读确认package脚本、build.mjs、TypeScript／ESLint入口和AI SDK实际位于扩展node_modules。正式执行前再次确认输入存在、普通文件／删除分类及模块解析，冻结台账。单个检查用Python subprocess外部timeout，不以工具yield时间当超时；台账存忽略目录`.superpowers/sdd/2026-11-26-beacon-prompt-information-flow/`，保精确argv、cwd、输出、退出码、耗时与失败层次。

默认不跑client typecheck、OI统一编译、Gulp stage或UI渲染：本计划没有原生源码／webview变化。若实际实现发现必须触及这些边界，先回报并修订范围与验证矩阵，不能悄悄扩展。不存在的入口、错误路径或脚本语法问题算orchestration，不算源码失败。

## Task 1：统一模型结果投影，保持原始结果兼容

**Files:** 新建`src/toolModelOutput.ts`；修改`src/fileTools.ts`、`context.ts`、`session.ts`、`webTools.ts`；测试`test/files.test.ts`、`session.test.ts`。

**Interfaces:**

```ts
// src/toolModelOutput.ts
export type BeaconModelOutput = CompletedToolFact['output'];
export interface BeaconModelFailure { code: string; message: string }
export function modelFailureOutput(failure: BeaconModelFailure): BeaconModelOutput;
export function fileModelOutput(output: FileOutput): BeaconModelOutput;
export function webModelOutput(output: WebOutput): BeaconModelOutput;
export function contextModelOutput(name: BeaconContextToolName, output: ContextOutput): BeaconModelOutput;
```

- Consumes：现有FileOutput／WebOutput／ContextOutput和Protocol的output联合类型。
- Produces：所有新模型结果的唯一纯投影；FileOutput新增可选`failureCode?: string`，只保受控原因，原code／error不变；Web失败仍保原简码。

- [x] **Step 1：添加失败测试** `file_failure_keeps_ui_and_model_contracts_separate`：模拟ENOENT，断言raw.code=`material-missing`、raw.error为字符串、raw.failureCode=`file-not-found`；模型JSON内error.code=`file-not-found`、message为既有safeFileError，ok:false／path保留。
- [x] **Step 2：添加`image_projection_preserves_media`及`legacy_history_error_remains_string`**：图片仍content媒体输出且正文元数据不含base64；旧toolResults及旧协议加载与回放不改写。用以下命令先确认失败：`npm run typecheck`、`npm run build`、`node --test dist-test/files.test.cjs dist-test/session.test.cjs`。
- [x] **Step 3：实现上述导出**。fileErrorName只在原catch处取受控码，不能把任意异常message装进failureCode；未知为read_failed。file.message复用safeFileError；guardRead异常保原UI合同并补确切context原因。新模型投影不透传failureCode这个内部字段，正文、notes、图片不被重复复制。
- [x] **Step 4：转接原fileModelOutput／webModelOutput导出并重跑同组**，确认history旧数据、附件捕获和活动UI仍消费原始形态。此任务不先改Provider三个出口，留Task 3成组接线。

## Task 2：按来源生成结果释义及确切Context错误

**Files:** 新建`src/toolResultNotes.ts`；修改`toolModelOutput.ts`、`contextTools.ts`、必要的`recordProjection.ts`；测试`test/toolInformation.test.ts`、`semanticContext.test.ts`、`visiblePages.test.ts`。

**Interfaces:**

```ts
// src/toolResultNotes.ts — pure, returns no empty field in final output
export function contextResultNotes(name: BeaconContextToolName, output: ContextOutput): readonly string[];
export function fileResultNotes(output: FileOutput): readonly string[];
export function webResultNotes(output: WebOutput): readonly string[];
```

- Consumes：实际成功结果；Record事实投影保持原样。
- Produces：按第3轮表生成的相关英文句子，在Task 1模型投影中形成可选外层notes；失败已由error对象说明，不附正常结果释义。

- [x] **Step 1：添加`notes_follow_actual_run_source_and_fields`**：Runner completed＋merged不生成check通过；CPH无check说明“no answer verdict”而非passed；缺stdout／stderr不补空串；not-run／start-failed不冒充执行；notes不包含学生输出中的指令。
- [x] **Step 2：添加`truncation_and_hash_notes_preserve_distinctions`**：新前缀截断、legacy head/tail且计数为0、正omittedBytes、sourceOmittedBytesAtLeast分别触发；完整源码hash和片段缺失并存不矛盾；Notebook当前cell与执行时cell说明分开。
- [x] **Step 3：添加`empty_recent_queue_is_not_absence_of_activity`、`context_failures_keep_owned_reasons`**：records:[]保成功和近期范围；latest not_found不否定历史；两类owner、页面关闭／改版、32KB旧run分别有安全message；未知不凭正则猜登录。先跑`npm run typecheck`、`npm run build`、`node --test dist-test/toolInformation.test.cjs dist-test/semanticContext.test.cjs dist-test/visiblePages.test.cjs`确认红。
- [x] **Step 4：实现纯notes与Context确切错误分支**。保原codeHash算法、列表顺序、固定记录、查询校验和execute输出正文；既有受控完整错误码精确查表，真实OJ题面读取原因沿已有owner受控码，不新增站点请求／登录探测。已有redactValues继续保留，notes仅插入确定性数字或受控来源名。
- [x] **Step 5：重跑同组**。比较投影前后原record及入队对象deepEqual，notes不写Store、不改变32768字节拒收，不使用第二次模型生成说明。

## Task 3：把普通执行及SDK拒绝接入同一真实出站／留存路径

**Files:** 修改`src/provider.ts`、`toolModelOutput.ts`；测试`test/prompts.test.ts`、`promptQuality.test.ts`、`requestRecovery.test.ts`、`contextBudget.test.ts`。

**Interfaces:**

```ts
// toolModelOutput.ts; inputs contain one newly closed SDK step only
export function normalizeNewToolFailures(
  messages: readonly ModelMessage[],
  failures: ReadonlyMap<string, BeaconModelFailure>
): ModelMessage[];
```

- Consumes：Task 1／2纯投影、刚闭合SDK step的消息与已知失败调用ID，不包括历史旧消息。
- Produces：同次新工具结果的toModelOutput、完成工具事实、protocol.result／封口与下一SDK请求同义；局部Map仅描述该新step，不持久化、不成为新材料库。调用者只传这一步新增消息，不能在整段历史上按相同ID全局替换。

- [x] **Step 1：新增`new_tool_output_matches_live_completed_and_replayed`**：通过现有SSE合成fetch调用一次工具，核对下一请求tool消息、generation.acceptCompletedTool、已封protocol中的notes／error对象相同；再resume／reload后ID与事实仍相同，原工具execute计数不增加。
- [x] **Step 2：新增`sdk_invalid_arguments_are_structured_without_execution`、`cancelled_tool_is_not_a_completed_failure`**：发送schema错误参数，断言execute=0，下一请求收到error.code=invalid_arguments，不含原始堆栈／密钥；取消已abort不注册完成结果。另构造历史交换与新调用重复toolCallId的案例，旧error-text即使同ID也保持原样。先跑`npm run typecheck`、`npm run build`、`node --test dist-test/prompts.test.cjs dist-test/promptQuality.test.cjs dist-test/requestRecovery.test.cjs dist-test/contextBudget.test.cjs`确认红。
- [x] **Step 3：接入普通成功／业务失败三出口**，统一调用Task 1投影；先规范化，再fileMessages媒体准备，再预算计量／fingerprint，不让SDK后续实际请求带旧形态而留存新形态。
- [x] **Step 4：处理当前SDK7旁路**。已查明`createToolModelOutput`的errorMode=text/json绕过tool.toModelOutput，参数invalid也可能没有execute-end回调。从新step的tool-call.invalid／tool-error及step.content捕获受控失败，在onStepEnd仅正规化该step.response.messages后封口。prepareStep依据最近已闭合step新增的response消息数，只正规化本次messages相应后缀再交prepareAnswer，不能遍历历史按ID替换；以前已正规化输入照常保留。即时protocol／完成事实用同一失败输出。原调用输入保持SDK实际表示，不修改node_modules、不开启repairToolCall、不重新执行或改变输入。未知工具只回unavailable，不把它注册为新能力。
- [x] **Step 5：重跑同组并核对实际fetch body**。既有onStepEnd接受闭合交换、恢复额度及20步预算不变；相同错误不能产生两份完成事实，SDK原始error-json／error-text不得遗漏到新步骤。若实际SDK时序无法满足，保留失败证据并修订本任务接线，不静默改harness协议。

## Task 4：接入首层环境、导师核心与九工具文字

**Files:** 修改`src/prompts.ts`、`contextTools.ts`、`contextToolContract.ts`、`provider.ts`；测试`test/prompts.test.ts`、`promptQuality.test.ts`、`toolInformation.test.ts`。

**Interfaces:** 继续`ContextAccess.describe(signal): Promise<string>`与`composeBeaconPrompt`现有入口。describe结果在已有pages旁提供`beaconMode`及`beaconWorkspace:{path,activityCollectionEligible}|null`；compose把currentTime放同一宿主段，保内部version，去掉模型正文的提示版本。

- [x] **Step 1：新增`host_scope_distinguishes_collection_from_read_access`**：健康Blackout根输出path＋eligible:true但无三记录工具；已确认无根null，已选异常根eligible:false；没有ContextAccess时不伪造模式／工作区。宿主不含busy／recent／activeId，不读任何队列正文。
- [x] **Step 2：扩充四provider实际装配矩阵**，核对无工具／无根／三模式／搜索开关；当前普通工具schema与基线接受集合一致，fetchProblem与browseWeb开关独立。先跑`npm run typecheck`、`npm run build`、`node --test dist-test/prompts.test.cjs dist-test/promptQuality.test.cjs dist-test/toolInformation.test.cjs`确认红。
- [x] **Step 3：逐字接入第1轮核心及宿主、第2轮九工具与属性文案**，普通参数只更新description，不扩大enum、required或接受集合；动态文件范围依据permission／roots生成，Blackout所选根从scope.root取得。目标版本改2026-11-26.4并更新相关既有断言。
- [x] **Step 4：与Task 2结果释义成组接线并重跑**。不提前删结果说明造成过渡版本缺口；system不复写九工具目录，不强制读overview，不改变开始时目录只读一次的观察语义。

## Task 5：文件／页面续读及网页部分结果的实际反馈

**Files:** 修改`src/toolResultNotes.ts`、`toolModelOutput.ts`、`webTools.ts`；测试`test/files.test.ts`、`web.test.ts`、`semanticContext.test.ts`。

**Interfaces:** WebOutput成功分支内部新增可选`sourcesOmittedByBudget?: true`，仅owner本次循环设置；模型投影将其变为相关notes，不把内部字段当网站事实或存入WebSource。

- [x] **Step 1：新增`continuation_uses_true_units_and_pdf_page`**：中文／emoji文件的nextOffset按Unicode码点；binary按字节；PDF保pageNumber；readPage offset>0的末段无nextOffset时不生成继续提示。图片没有文本范围提示，search.truncated不生成offset。
- [x] **Step 2：新增`web_distinguishes_empty_partial_and_budget`**：三份合成服务结果分别产生真实sources:[]、0来源即预算拒收→budget、部分来源后预算停止→保已有正文和集合省略notes；text各自truncated:false时集合仍可不完整。先跑`npm run typecheck`、`npm run build`、`node --test dist-test/files.test.cjs dist-test/web.test.cjs dist-test/semanticContext.test.cjs`确认红。
- [x] **Step 3：实现相应短释义及owner明确预算分支**；保6次／32000字符、单来源限制和现有网络安全边界，不新增分页／重试／抓全文。源被预算省略与网站没有内容分别表达，内部flag只在真实分支出现。
- [x] **Step 4：重跑并比较raw file／page读取行为**，nextOffset只给位置、不保证余量；继续读取如遇预算仍按原失败。搜索object未读内容不进入notes，网络服务objective保原文。

## Task 6：摘要声明只由实际固定记录生成

**Files:** 修改`src/contextTools.ts`、`contextToolContract.ts`、`compaction.ts`；测试`test/compaction.test.ts`、`semanticContext.test.ts`、`contextBudget.test.ts`。

**Interfaces:**

```ts
// ContextAccess optional additive hook, no records exposed
fixedRecordIds?(): Readonly<Partial<Record<'readProblemRecord'|'readRunRecord'|'readVerdictRecord', readonly string[]>>>;
// contextToolContract.ts
export interface BeaconContextToolDeclaration { name: BeaconContextToolName; description: string; parameters: JSONSchema7 }
export function compactionToolDeclarations(ids: ReturnType<NonNullable<ContextAccess['fixedRecordIds']>>): readonly BeaconContextToolDeclaration[];
```

fixedRecordIds在compacting视图上按其真实fixed map和原模式权限产生新数组，compacting.names同步只含确有合法ID的工具；普通视图的names和查询行为不变，fixedRecordIds返回空对象。工具名前缀和kind映射在现有ContextTools维护，不从任意消息／摘要／目录扩充。自定义ContextAccess无hook时摘要不注册工具，仍可整理已有历史。

- [x] **Step 1：新增`summary_declarations_use_kind_specific_fixed_ids`**：先列目录不能固定正文，成功读run:a与verdict:b后，摘要各enum仅含自身ID，required只有id；新工具／latest／filePath不出现；跨kind／未知ID被原execute拒绝。
- [x] **Step 2：新增`summary_without_fixed_records_has_no_tools`**，覆盖无hook、无fixed、Blackout／无根；新增`ordinary_tools_return_after_summary`，压缩后普通列表/latest能力正常；比较预算activeTools与真实fetch body的声明一致。先跑`npm run typecheck`、`npm run build`、`node --test dist-test/compaction.test.cjs dist-test/semanticContext.test.cjs dist-test/contextBudget.test.cjs`确认红。
- [x] **Step 3：用一份声明生成SDK tools与计量definitions**，id只有实际enum，description接第4轮D2。保原本fixed map、scope execute检查与JSON summary合同；Task 1／3投影同样用于摘要工具，并对本阶段新SDK失败保持相同正规化和安全反馈。
- [x] **Step 4：接入第4轮摘要system、旧摘要前缀、尾部分隔和回注文字**，重跑同组；同模型、尾部保留、图片准备、单步恢复与历史指纹不改，不借本轮补60%目标差距。

## Task 7：材料、图片与续答的历史归属

**Files:** 修改`src/provider.ts`、`attachments.ts`、`session.ts`；测试`test/attachments.test.ts`、`session.test.ts`、`compaction.test.ts`、`promptQuality.test.ts`。

**Interfaces:** 保现有attachmentParts、fileMessages和ChatSession.resume签名。fileMessages提取工具图片时携带对应外层toolCallId／toolName，逐媒体前放第4轮包装和真实标识，不改原protocol数据。

- [x] **Step 1：新增`tool_images_keep_each_original_call_on_followup`**：同一tool消息含两份图片结果时两张图分别有正确原调用标识；后续问题／换模型／摘要里包装不再说current question，也不重新读取文件。
- [x] **Step 2：扩充`resume_appends_without_repeating_completed_tools`、`edit_keeps_original_attachments_and_drops_tail`**：暂停后完整配对不重演；编辑保原附件、弃分支和不适用摘要不回流；失败只保已完成工具交换，跨来源私有reasoning／providerOptions继续过滤。先跑`npm run typecheck`、`npm run build`、`node --test dist-test/attachments.test.cjs dist-test/session.test.cjs dist-test/compaction.test.cjs dist-test/promptQuality.test.cjs`确认红。
- [x] **Step 3：接入第4轮附件／二进制／图片／续答英文**，保持实际user角色兼容媒体但明确来自原工具结果；不加新的捕获时间／游标或授权，不在每份附件堆共同安全说明。
- [x] **Step 4：重跑同组并验证媒体仍计入实际出站与容量**。no-vision和图片估算不确定的既定行为不变；原始消息与图片字节不能因重复投影丢失或倍增。

## Task 8：整体复审、文档同步与源代码交付

**Files:** `docs/beacon/README.md`、`architecture.md`、`tool-contract.md`、`context-compaction.md`、`implementation-status.md`、新建`docs/beacon/review/2026-11-26-prompt-information-flow-installed.md`；必要的现有回归测试。原七主题及旧版完整审阅稿保持原文。

- [x] **Step 1：主agent按Spec逐项自检**：从首包走完整工具循环、普通／摘要／续答及失败历史，分别核对指令／数据、来源时点、schema、三出口和预算；核实没有改src/vs原生owner、队列DTO或webview。
- [x] **Step 2：在最终工作树完整跑** `npm run typecheck`→`npm run build`→`npm test`→`npm run lint`；要求退出0、无fail／cancelled、skip如存在说明原因。不拿Task中间结果替代最终版，不预填342或其他通过数。
- [x] **Step 3：独立只读reviewer复审最终差异与实际合成请求**。Native执行时由主agent统一写共享文件，reviewer按任务里程碑和全局集成分别指出具体问题；修复后重跑所属组及被失效的完整矩阵。子agent意见不代替主agent检查或负责人体验。
- [x] **Step 4：写已接入英文／中文对照与条件表**，标2026-11-26.4真实入口，区分模型请求中的notes、raw UI字段与旧历史；现行文档只在源码确实接入后更新。`context-compaction.md`同步Task 6实际阶段声明、按kind的合法ID枚举及无fixed时无工具，删除已经修复的普通schema复用差距；保留60%目标未传给生成器的独立已知差距。保旧快照／访谈，不写成教学效果已改善。
- [x] **Step 5：跑文档validator、变更文件UTF-8／本地链接检查、git diff --check**；新文件独立枚举，确认七主题byte/hash与基线一致、负责人宏完全相同。台账保存原始红／失败及最终绿，输出源码交付说明与未验收边界。
- [x] **Step 6：停在已授权交付范围**。不自动构建stage、调用DeepSeek／Ollama、打开实例、提交／推送。后续模型对照按Spec场景矩阵另作可执行测试计划，原始失败与澄清恢复分开计量；source green不代表模型质量或真实五站通过。

## 3. 计划自检与审阅状态

Spec第1／3／4节→Task 4；第5节→Tasks 1／2／3／5；第6节→Tasks 6／7，并由Task 8同步现行压缩合同；第7节保护范围→全部Global Constraints及Task 8；第8节产品知识→Task 8保原稿；第9节静态／离线→各任务与最终矩阵，模型／stage边界→Task 8 Step 6。Review Focus五项均有对应具体回归。

推荐Native：由主agent统一实施，子agent在投影接线、摘要及最终集成处独立复检，因为Provider／ContextTools／compaction接口相互依赖，按文件平行写容易制造瞬时不一致。若负责人选择Subagent-driven，则每Task串行单独写owner区，审阅通过后进入下一任务，不同时写共享文件。

主agent自检：各Spec要求和五项Review Focus均已映射到任务；投影、notes、SDK单步正规化及fixedRecordIds的签名在任务间一致；八任务均明确所属文件、行为断言与确切验证入口，不按提示句子添加镜像测试。纯类型依赖、旧导出和raw UI兼容有独立保护，计划不提前修改现行能力描述。

独立复检：Zeno核对Tasks 1／2／3／5及SDK真实消息时序，未发现必改项；Ptolemy核对其余任务、设计覆盖和验证入口，指出Task 8遗漏现行压缩合同。IP-D1已补文件、同步内容和覆盖映射，原审阅者定点复检确认闭合，无新增发现。均为只读计划审查，未执行源码测试、构建或模型调用，不代表实现或验收通过。

负责人已回复“采纳建议，进入实施”，采用Native。本计划已进入实施；完成项以下方勾选及接入记录为准。无自动Git提交步骤，后续只有负责人明确请求才备份提交。

实施完成：2026-11-26，工作树2026-11-26.4；最终类型／build／365项回归／lint通过，独立review发现已修复。源码与实际模型／stage验收边界见[接入记录](../../beacon/review/2026-11-26-prompt-information-flow-installed.md)。未作Git操作。
