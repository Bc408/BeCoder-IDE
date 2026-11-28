# Problem Statement Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. 负责人于 2026-11-28 选择 Native 并确认实施；本计划按顺序执行，末尾作一次独立只读复核。阶段检查点不自动授权 commit、push 或新建分支。

**Goal:** 让 OJ Connect 常驻中英语种选择，按用户动作生成并复用题面译文，让 Beacon 的 fetchProblem 通过应用级 30 题缓存优先读取指定语种。

**Architecture:** 原生单一服务持有题面缓存和短期翻译任务身份，OJ Connect 提供站点正文与用户动作，Beacon 复用现有连接执行独立翻译请求。结构与保护内容在宿主校验后一次发布，fetchProblem 的缓存／联网路由保持只读；原工作区行为记录独立。

**Tech Stack:** 现有 TypeScript、Code - OSS services／IPC、React、AI SDK Provider 适配、Markdown／HTML AST 解析、Node／Mocha、esbuild 和 Playwright；不新增翻译 SDK 或升级依赖。

**Spec:** [已审阅设计](../specs/2026-11-28-problem-statement-translation-design.md)。负责人已批准完整设计，并将可见中文文案修订为“译文”“原题未提供，点击翻译”。2026-11-28负责人选择 Native 并确认实施；源码已接入；检查证据与真实模型、stage、负责人验收边界见实现状态。

## Global Constraints

- 基线 `Beacon_Persona@076eb778f234a83036c008b03567aeb3d82870ad`，应用 2.2.0。保留当前设计／计划文档，不重置已有工作、不改版本、不清理缓存或构建产物。
- 应用级缓存默认 30 题，键为站点加规范题号，一题一个元素，中英版本合并；读取不调整顺序，Get 和成功翻译入尾。
- 缓存只保存题面内容及内部完整性事实；不保存代码路径、用户拿题时间、聊天、用户身份或密钥。不向模型开放目录、顺序或缓存文件路径。
- 只支持 `zh-CN`／`en`。题面语言栏常驻，中文缺失项为 `zh-CN（原题未提供，点击翻译）`，已译项为 `zh-CN（译文）`，另一方向对称。
- 英文对应 `zh-CN (Not provided by source; click to translate)`、`zh-CN (Translation)`；提示跟随界面语言，题面标题／章节跟随题面语种。
- 原文变化使依赖译文失效；原文未变复用译文，站点完整版本优先。保留样例空格／换行、公式、代码、变量、数值与链接目标。
- 翻译模型选择独立，连接／密钥／模型参数复用现有数据；无默认自动选择，不携带人格、聊天、用户代码或工具，不静默改模型／参数。
- 仅用户选择缺失语种启动翻译；完整校验与缓存发布成功后切换。失败／取消保原文和缓存；没有操作等待队列、自动重放或自动重译。
- fetchProblem 新参数必需 `language: 'zh-CN' | 'en'`，所有模式／无根可精确读取；未命中所需语种再联网，不自动翻译、不写缓存、不产生看题记录。
- 保留 problem13／run30／verdict20、采集资格、Blackout 持久行为记录边界、现有提交／站点会话／编译器流程、聊天历史与压缩语义。
- 本次执行完成下述离线源码验证，不调用真实模型、不启动原生 GUI、不构建 stage 或 Setup；stage、真实服务、Git 发布仍按届时明确授权和 AGENTS.md 执行。

## Review Focus

1. 同题重新获取或跨窗口更新发生在翻译中途：旧译文不能覆盖新版；重复请求立即拒绝，不重放（Task 1、5）。
2. 纯英文题在中文界面、纯中文题在英文界面：正文选择不偷偷启动翻译，章节语言不混乱，关闭下拉后的文案不挤压提交控件（Task 2、5）。
3. 代码围栏、HTML 实体、公式里的比较符、重复数值及样例空白：翻译前后保护内容一致，结构不成为可执行 HTML（Task 3）。
4. 关闭题面页、重载窗口、模型移除或修改连接与翻译完成竞争：任务正确退役，迟到结果不写盘，已开始请求保配置快照（Task 1、4、5）。
5. Blackout／无根的缓存命中及目标语种缺失：只返回指定题面或可用语种，不泄露活动信息，零隐式模型调用／写盘（Task 6）。

## 文件与接口地图

下文中的 Create 是计划新增路径，不表示文件已经存在。创建每个文件前读取同所有者至少两个邻近文件，保持其头部、导入和测试约定。主进程负责共享文件，扩展只使用有限 IPC／命令。

| 责任 | 计划路径 |
| --- | --- |
| 共用 DTO | Modify `src/typings/becoder-oj-connect.d.ts` |
| 原生缓存契约 | Create `src/vs/platform/browserView/common/ojStatementCache.ts` |
| 文件与合并 | Create `src/vs/platform/browserView/node/ojStatementCache.ts` |
| 应用服务与任务身份 | Create `src/vs/platform/browserView/electron-main/ojStatementCacheService.ts` |
| 服务注册／工作台桥 | Modify `src/vs/code/electron-main/app.ts`、`src/vs/workbench/workbench.desktop.main.ts`；Create `src/vs/workbench/contrib/becoder/electron-browser/ojStatementCache.contribution.ts` |
| 题面规范与站点 | Modify `extensions/becoder.oj-connect/src/domain.ts`、`site-scripts/atcoder.ts`、`site-scripts/codeforcesProblem.ts`、`src/vs/platform/browserView/common/luoguProtocol.ts`；Create `extensions/becoder.oj-connect/src/statementLanguages.ts` |
| 翻译文本与任务 | Create `extensions/becoder.beacon/src/translationContent.ts`、`translationPrompts.ts`、`translation.ts`；Modify `provider.ts` |
| 翻译选择与设置 | Modify `extensions/becoder.beacon/src/modelConfiguration.ts`、`connections.ts`、`extension.ts`、`package.json`、`webview/Settings.tsx`、`webview/beacon.css`；Create `webview/TranslationSettings.tsx` |
| 题面业务与页面 | Modify `extensions/becoder.oj-connect/src/extension.ts`、`views/problemPanel.ts`、`views/model.ts`、`views/webview.ts`、`webview/luogu/problem.tsx`、`webview/styles.css`；Create `src/statementCache.ts` |
| 工具路由 | Modify `extensions/becoder.beacon/src/contextTools.ts`、`contextToolContract.ts`、`toolModelOutput.ts`、`toolResultNotes.ts`、`extension.ts` |

### 贯通类型

在 `becoder-oj-connect` 内定义类型，core 只作类型导入，沿邻近 Beacon DTO 的分层约定。既有 `ProblemDocument.bodies` 扩展可选 `title` 和 `origin`，旧消费者仍能读取旧字段。具体站点不在 DTO 层伪造语种。

```ts
type StatementLanguage = 'zh-CN' | 'en';
type StatementOrigin = 'site' | 'translation';
type StatementContent = Pick<ProblemDocument,
  'ref' | 'title' | 'bodies' | 'samples' | 'limits' | 'interactive' | 'difficulty' | 'tags'>;
interface StatementVersion {
  language: StatementLanguage; title: string;
  sections: readonly Section[]; origin: StatementOrigin;
}
type StatementRead = Omit<StatementContent, 'title' | 'bodies'> & { version: StatementVersion };
interface StatementTranslationTicket {
  id: string; source: StatementRead; targetLanguage: StatementLanguage;
}
```

`StatementRead` 含 `ref` 与原样样例／限制，不含缓存次序、采集时间或源指纹；指纹和写入版本只在原生 owner 内部。工具结果再投影到既有 `problem/document` 外形，不直接透传 IPC 对象。

## Task 1: 应用级题面缓存与发布生命周期

**Files:** 文件地图中 DTO、三个原生缓存文件、服务注册／工作台桥；Create `src/vs/platform/browserView/test/node/ojStatementCache.test.ts`、`test/electron-main/ojStatementCacheService.test.ts`；Modify `scripts/run-browser-session-tests.mts`。

**Interfaces:** `IProblemStatementCacheService`、channel `becoderProblemStatements`；工作台命令 `_becoder.ojConnect.statementCache` 只分派以下方法，windowId 由实际工作台注入。

```ts
read(windowId: number, ref: ProblemRef, language: StatementLanguage): Promise<StatementRead | undefined>;
merge(windowId: number, document: StatementContent): Promise<StatementContent>;
publishAcquired(windowId: number, document: StatementContent): Promise<StatementContent>;
acquireTranslation(windowId: number, source: StatementRead, target: StatementLanguage): Promise<StatementTranslationTicket>;
publishTranslation(windowId: number, ticketId: string, version: StatementVersion): Promise<StatementContent>;
releaseTranslation(windowId: number, ticketId: string): Promise<void>;
```

Store 在 `join(environment.userDataPath, 'becoder', 'problem-statements.json')` 保存 `{version:1, entries:[...]}`。内部元素按 ref 唯一、包含版本及源指纹；目标和根由 owner 确定，调用方不能传路径。新建 node／test/node 所有权目录，沿邻近 Beacon node 与 browserView 测试的约定。单题内容沿既有 8 MiB 题面校验，不套用 run 的 32 KB。内部发布串行，不串行等待用户翻译请求。

- [x] **Step 1: 写纯 Store 失败测试。** 测试名 `thirty_unique_problems_merge_languages_and_evict_oldest`、`read_does_not_move_or_write`、`unchanged_source_keeps_translation_changed_source_invalidates`、`site_version_replaces_translation`、`reopen_store_reads_same_application_cache`。断言第 31 个不同 ref 淘汰首题，同题双语只占一格，读前后原始文件字节不变；无用户活动字段。
- [x] **Step 2: 写发布和生命周期失败测试。** `two_windows_preserve_each_others_updates`、`stale_translation_cannot_replace_new_acquisition`、`new_source_then_eviction_does_not_revive_stale_ticket`、`duplicate_translation_rejects_without_waiting`、`window_reload_and_close_retire_ticket`、`publication_failure_preserves_old_file`、`corrupt_cache_is_not_a_miss_or_silently_reset`、`evicted_source_can_be_republished_by_current_ticket`。用显式 barrier／可注入文件发布接点控制竞争，覆盖写前失败、发布确认不明和根重定向；新版之后再淘汰，也不能复活旧源译文。
- [x] **Step 3: 转译并运行新增测试，记录旧实现缺少服务／行为的预期失败。** Node：`npm run transpile-client` 后 `npm run test-node -- --run src/vs/platform/browserView/test/node/ojStatementCache.test.ts`。Electron：把新服务测试加入现有 runner 的 names 后运行 `npm run test-browser-session`；失败输出必须来自真实测试，不能把错误命令当红灯。
- [x] **Step 4: 实现纯数据合并、指纹、受控文件发布和应用服务。** 从缓存内容剔除编译器目录及全部活动字段；在 `app.ts` 的既有 `services.set(...new SyncDescriptor(...))` 和 channel 注册位置接入；工作台桥参照 Beacon 的真实 windowId 注入，不复用 Beacon 根／模式判断。
- [x] **Step 5: 实现任务登记与清理。** 内存中每个同题同源同目标最多一个 ticket；取消／窗口关闭／重载退役，发布前复核身份和源版本。每次新原文发布同时失效不匹配的活跃 ticket，后续淘汰不恢复它。没有写入时不建立持久 pending 或补偿队列；应用最终退出只 join 已开始的文件发布，不能等网络翻译完成。
- [x] **Step 6: 重跑 Step 3，复核可见接口只有指定题目读取。** 预期相关 Node／Electron 测试退出 0；文件失败保旧数据；窗口与用户数据目录分别隔离。本任务完成是后续接口检查点，不自动提交。

## Task 2: 五站中英正文、标题与章节规范

**Files:** 文件地图中的站点文件、`statementLanguages.ts`、`domain.ts`；Modify `extensions/becoder.oj-connect/test/domain.test.ts`、`siteScripts.test.ts`、`statementRead.test.ts`、`src/vs/platform/browserView/test/common/luoguProtocol.test.ts`、`src/vs/platform/browserView/test/electron-main/ojStatementParser.test.ts`；Create `extensions/becoder.oj-connect/test/statementLanguages.test.ts`。

**Interfaces:** `statementLanguages(document: StatementContent): readonly StatementLanguage[]`；`selectStatement(document: StatementContent, language: StatementLanguage): StatementRead | undefined`。返回正文时按 body.title 优先、真实 document.title 兜底，origin 默认 site；只列真正完整的正文，不触发缓存、翻译或网络。

- [x] **Step 1: 写失败测试。** `atcoder_only_exposes_english_body_with_exact_samples`、`english_statement_has_english_generated_headings`、`luogu_keeps_two_complete_languages_but_summary_is_not_chinese_body`、`locale_does_not_follow_ui_language`、`per_language_title_and_sample_explanation_survive_validation`。AtCoder 使用同份 ja/en HTML，断言只暴露 en，样例原样；洛谷同时覆盖两份完整正文和仅 translation 字符串。
- [x] **Step 2: 运行现有 owning 入口观察失败。** `npm --prefix extensions/becoder.oj-connect run typecheck`，然后 `npm --prefix extensions/becoder.oj-connect test`；Luogu 原生测试在 `npm run transpile-client` 后运行 `npm run test-node -- --run src/vs/platform/browserView/test/common/luoguProtocol.test.ts`。
- [x] **Step 3: 实现语种规范与验证。** 只认 zh-CN／en 的完整 body，保留每语种标题／来源；兼容旧无可选字段的已有文档。AtCoder 不持久化／展示 ja 正文，仍复用同份 HTML 的原样样例识别；Luogu／CF 产品生成章节标题按 body 语种整理，不能全局依 UI 语言替换作者文字。
- [x] **Step 4: 重跑 Step 2、`npm run test-browser-session` 并检查原站点提交与编译器测试。** 两处原 AtCoder bilingual 断言按新需求改为仅 en，保留原样样例、公式和说明索引断言；不删测试或跳过失败。预期原 OJ 全套及新测试退出 0；站点登录、样例导入、提交语言与账户会话代码不因题面语言改变。

## Task 3: 可校验的题面翻译内容与专用提示

**Files:** Create `extensions/becoder.beacon/src/translationContent.ts`、`translationPrompts.ts`、`test/translationContent.test.ts`；Modify `build.mjs`、`package.json` 的测试入口。

**Interfaces:** `prepareStatementTranslation(source: StatementRead, target: StatementLanguage): PreparedStatementTranslation`；`translationBatches(prepared: PreparedStatementTranslation, connection: Connection): readonly TranslationBatch[]`；`applyStatementTranslation(prepared: PreparedStatementTranslation, results: readonly TranslationBatchResult[]): StatementVersion`。这些函数不联网、不写盘。

定义 `TranslationPart={id:string,text:string}`、`TranslationBatch={id:string,from:StatementLanguage,to:StatementLanguage,parts:readonly TranslationPart[],protected:Readonly<Record<string,string>>}`、`TranslationBatchResult={id:string,parts:readonly TranslationPart[]}`。`PreparedStatementTranslation` 含冻结 source、target、parts，以及仅本地使用的 `{partId,field:'title'|'sectionHeading'|'sectionContent',sectionIndex?,start,end,protected}` 回填表；start/end 为原字段 UTF-16 offset，保持 JS slice 同口径，不按实体解码后的长度定位。

每批请求含 from、to、parts 与所引用保护内容的只读映射，响应严格为 `{parts: TranslationPart[]}`，批次 id 由本地关联而非相信模型回传。编号固定标题／章节对应关系，保护 token 使用本次唯一前缀且避开原文冲突；响应不能增删／重复编号或改动所用 token。

- [x] **Step 1: 写保护与回填失败测试。** `keeps_code_math_sample_bytes_numbers_and_urls`、`preserves_html_entities_and_markdown_fence_tail`、`rejects_missing_duplicate_extra_ids_and_mutated_tokens`、`hostile_markup_cannot_add_executable_content`、`rejects_partial_batch_without_a_version`。使用嵌套列表、表格、含比较符的公式、代码中的围栏字面量、HTML var/pre/code、CRLF 和末尾正文；断言只替换可翻译文本，语法与保护内容原样。
- [x] **Step 2: 写容量与分批失败测试。** `normal_statement_is_one_batch`、`long_statement_splits_only_at_complete_structure_boundaries`、`single_oversize_part_fails_without_truncation`。计量包含实际 system、请求 JSON、上下文、保护映射和输出预留，使用已有模型容量默认及估算规则；原 source 不随分批改变。
- [x] **Step 3: 登记测试构建入口并运行新测试观察失败。** `npm --prefix extensions/becoder.beacon run build` 后 `node --test extensions/becoder.beacon/dist-test/translationContent.test.cjs`。新增测试包仿照现有 esbuild 测试项，正式新增实现前确认测试到达目标函数。
- [x] **Step 4: 实现 source-range 提取与回填。** 使用当前已安装的 unified／remark-parse／remark-math／remark-gfm 和 hast-util-from-html 的原始位置；解析器配置需保留 HTML source location，不能依赖渲染后的 offset。保护公式／代码／结构属性／样例，按原文位置回填；HTML 文本替换转义其文本上下文，Markdown 文本替换转义新增语法并重解析校验结构，不把经过排版、KaTeX 或 smartypants 变换的显示树重新序列化成题面。保留参考上下文，但不为每句调用模型；不可完整解析或无法保护的结构明确失败。
- [x] **Step 5: 编写竞赛题专用英文提示。** 参考设计所 pin 的 programming-docs 与测试；只翻译所给文本，明确数值边界、存在／任意、至少／至多、唯一性、索引和取模语义；不含 Beacon 人格或教学要求。任务语义与编号 JSON 协议分开，要求输出完整且无题解。
- [x] **Step 6: 重跑新增测试及 Beacon typecheck／lint。** 预期退出 0，样例／公式／代码逐字节一致；同时记录机械校验无法证明自然语言译意正确，留给最终语义验收。

## Task 4: 独立翻译模型、生成入口与 Beacon 设置页

**Files:** 文件地图中 Beacon 模型配置、provider、extension、设置页及 CSS；Create `src/translation.ts`、`webview/TranslationSettings.tsx`、`test/translation.test.ts`；Modify `test/settings.test.ts`、`test/models.test.ts`、`test/render.mjs`、`build.mjs`、扩展本地化文件及 `package.json` 配置 schema。

**Interfaces:** `ModelConfiguration.translationSelection?: {provider: ProviderId; model: string}`；设置命令 `selectTranslationModel`；`Connections.translationSnapshot` 返回不含密钥的选项／选择／不可用原因；`Connections.translationConnection(): Connection` 返回点击时冻结的完整连接，内部使用，不发给 Webview。

Provider 在 `provider.ts` 新增 `generateTranslationBatch(connection: Connection, system: string, payload: string, signal: AbortSignal, request?: typeof fetch): Promise<string>`，复用已有 adapters、参数和 reasoningOptions。`translateStatement(ticket: StatementTranslationTicket, connection: Connection, signal: AbortSignal, progress: (completed: number, total: number) => void): Promise<StatementVersion>` 消费 Task 3。题面调用桥为 `_becoder.beacon.translateProblem`／`_becoder.beacon.cancelProblemTranslation`，参数分别是 ticket、requestId 和 requestId；进度通过 OJ 注册的 `_becoder.ojConnect.translationProgress` 发送 `{requestId,completed,total}`。原面板只接受当前登记 requestId；均为内部命令，不作为模型工具。

- [x] **Step 1: 写配置失败测试。** `translation_selection_does_not_follow_chat_selection`、`translation_uses_chat_disabled_but_configured_provider`、`removed_model_is_unavailable_without_fallback`、`old_configuration_has_no_automatic_translation_selection`、`connection_changes_affect_next_translation_only`。验证密钥只有一份、选择按 provider＋ID 隔离，模型参数冲突在发送前失败。
- [x] **Step 2: 写五适配器离线生成测试。** `translation_request_has_only_task_prompt_and_no_tools_or_history`、`custom_translation_preserves_optional_key_and_responses_contract`、`length_finish_reason_rejects_partial_result`、`cancel_and_timeout_abort_without_retry`、`all_batches_publish_one_version_only`。直接观察 mock HTTP 请求和真实 SDK 流，tools:false 的文本模型仍可翻译；custom 无密钥不读环境凭据，沿既有 store:false 与服务默认推理。
- [x] **Step 3: 写设置页面失败回归。** 中文导航顺序为模型配置、题面翻译；英文对应 Model configuration、Problem translation。未配置不自动选，切分类保留连接草稿和密钥弹窗身份，选择翻译模型不改聊天模型；提供 360／900 宽度、浅深色和键盘截图。
- [x] **Step 4: 更新新增测试的 build／test 清单后运行相关失败。** Beacon typecheck／build 后分别运行新增 `translation.test.cjs`、现有 settings／models 测试及 `npm --prefix extensions/becoder.beacon run test-render`，记录达到断言的失败。
- [x] **Step 5: 实现配置解析与独立请求。** 缺 translationSelection 的旧文档继续有效；不借聊天 snapshot 选择模型，不受仅用于聊天的供应商启停影响。每项完整任务复用原模型请求的 180000 ms 上界，分批共用同一取消信号和总期限，`maxRetries:0`；不调用 createGenerator 的聊天／工具／压缩链。
- [x] **Step 6: 实现专用配置页与调用桥。** 新页仅独立选择已有模型并显示必要配置状态，设置页及 schema 保留旧字段；连接／密钥／参数仍由原 owner 保存。翻译进度回到原 requestId，不写对话历史、显示思考过程或保存密钥到任务状态。
- [x] **Step 7: 重跑本任务回归和 Beacon 全套。** 预期新旧类型、bundle、Node、lint、渲染全部退出 0；应用未配置聊天时独立翻译配置仍可使用，模型不可用时错误不影响 Get Problem。

## Task 5: Get Problem 缓存接入与缺失语种交互

**Files:** 文件地图中的 OJ Connect 题面业务／页面及 `statementCache.ts`；Modify `src/messages.ts`、`l10n/bundle.l10n.zh-cn.json`、`test/render.mts`、`test/domain.test.ts`；Create `test/statementTranslation.test.ts`、`test/statementCache.test.ts`。Beacon 翻译桥如需回传进度，只调整 Task 4 定义的字段，不另造第二条模型调用。

**Interfaces:** `StatementCacheClient` 包装 Task 1 有限命令；`ProblemActions.translateStatement(source: StatementRead, target: StatementLanguage, signal: AbortSignal, progress: (completed: number, total: number) => void): Promise<StatementContent>`；`PanelState.translation?: {target: StatementLanguage; completed: number; total: number}`，`cancelTranslation` 为无额外权限参数的 PanelAction。现有 selectLocale 只接受 zh-CN／en。

- [x] **Step 1: 写真实动作链失败测试。** `get_problem_publishes_without_beacon_workspace`、`get_twice_merges_valid_translation_and_moves_one_entry`、`import_and_fetch_do_not_write_new_cache`、`cache_failure_does_not_prevent_original_statement_display`、`cached_translation_works_without_model_extension`。覆盖编辑器 Get 和浏览器 Get，原有读题行为记录仍按原 scope 正常采集。
- [x] **Step 2: 写任务竞争失败测试。** `select_missing_language_starts_once_and_keeps_original_until_publish`、`select_existing_language_never_starts_generation`、`cancel_close_reopen_and_source_change_ignore_late_result`、`duplicate_from_another_window_rejects_immediately`、`save_failure_does_not_show_success_or_retry_model`。使用带受控完成 Promise 的 mock 连接／缓存，断言取消前后调用次数、原文和旧队列。
- [x] **Step 3: 写文案／布局失败渲染。** 逐字断言 `zh-CN（原题未提供，点击翻译）`、`zh-CN（译文）` 及反向 en，两种界面语言下均有两项；键盘选中缺失项触发一次请求。渲染包含长选项、360／900 宽度与浅深色，提交／导入按钮保持可见；未完成时源正文仍可读，取消可用。
- [x] **Step 4: 运行 OJ typecheck、test 和 test-render 确认失败。** 使用现有 npm 脚本，不复用不存在的 build.mjs；生产 OJ 构建入口为 build-site-scripts.mts／build-webview.mts。
- [x] **Step 5: 实现 Get 发布和面板合并。** 新缓存发布从已有 publishAcquiredProblem 的 scope 早退之外接入，按真实 trigger 仅接 Get；文件路径不进入缓存。I/O 失败一次提示后仍显示当前站点内容。打开面板时合并有效缓存译文，默认选择已有版本，不为 UI 语言自动翻译。
- [x] **Step 6: 实现用户翻译生命周期。** 后端从当前面板 document 取 source，Webview 不提交任意正文／API 配置；先 acquire ticket，再显式激活 Beacon 扩展并调用 Task 4 桥，模型扩展不可用时正常报错，缓存阅读不依赖其激活。完整结果经过 cache.publishTranslation 后再切换；finally 释放 ticket 和取消监听，既有运行槽／collectionPending 不变。
- [x] **Step 7: 重跑本任务及 OJ 全套，并检查生产截图。** 用户所定文案必须展开可见，闭合控件不挤压相邻按钮；模拟渲染通过与原生视觉验收分别记录。

## Task 6: fetchProblem 语种与缓存优先路由

**Files:** 文件地图中 Beacon 工具路由；Modify `extensions/becoder.oj-connect/src/extension.ts` 的对 Beacon 导出；缓存私有路径保护修改 `src/vs/platform/beacon/common/beaconContext.ts`、`electron-main/beaconContextMainService.ts`、`node/beaconCoordinator.ts`、`src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts` 及 Beacon `src/extension.ts` 的 protectedRoots 装配。Modify Beacon `test/semanticContext.test.ts`、`files.test.ts`、`context.test.ts`、`toolInformation.test.ts`、`models.test.ts`、`contextQuality.test.ts` 和原生 `src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts`；实际涉及的历史 fixture 随拥有者更新，避免另建工具框架。

**Interfaces:** `BeaconToolInputs.fetchProblem = IBeaconProblemIdentity & {language: StatementLanguage}`；`ContextToolOptions.readCachedProblem(ref: ProblemRef, language: StatementLanguage, signal: AbortSignal): Promise<StatementRead | undefined>`。OJ 导出 `readCachedBeaconProblem` 只包装 Task 1，原 `readBeaconProblem` 保持联网取文接口。成功输出为 `{problem,language,origin,document}`，document 只含所选语种与原样题面事实；不返回缓存路径／次序／用户时间。语种缺失错误为 `statement_language_unavailable`，附该题 `availableLanguages`。

原生 Beacon 服务新增仅内部初始化使用的 `getProtectedResourceRoots(windowId: number): Promise<readonly string[]>`，工作台 command 的 operation 为 `internalResourceRoots`。根来自宿主绑定的 Task 1 缓存目录，初始化时并入 extension 的现有 protectedRoots；不加入 IBeaconContext、system、工具 schema 或工具结果。Coordinator 回调增加可选 `protectedRoots: readonly string[]`，checkPageAccess 同时校验原始与 canonical 路径，沿现有根外和 symlink 规则保护缓存目录。这个内部根配置不列目录、不开放任意路径读取。

- [x] **Step 1: 写 schema 和路由失败测试。** `fetch_problem_requires_zh_cn_or_en`、`cache_hit_returns_requested_version_without_network`、`cache_miss_fetches_without_publication`、`missing_requested_language_checks_network_then_reports_available_languages`；对 network、translate、publish、Get 的调用计数分别断言，不能以返回文字推定零副作用。
- [x] **Step 2: 写权限与历史失败测试。** `cache_exact_lookup_works_blackout_spot_flood_and_no_root`、`cache_never_appears_in_activity_directory_or_file_tools`、`result_omits_acquisition_time_and_other_problem_data`、`completed_legacy_fetch_exchange_replays_verbatim`、`old_missing_language_call_is_not_executed_again`。缓存读取前后保现有回答 scope 校验，取消仍沿 signal；搜索关闭不禁 fetchProblem。
- [x] **Step 3: Beacon build 后运行相关 existing test 包观察失败。** 新工具参数必须同步到 SDK 验证、计量、工具说明和相关 fixture，不把大范围旧 fixture 参数失效视为模型错误。
- [x] **Step 4: 实现 harness 路由及内部目录保护。** 先 resolve 规范 ref，再按 language 精确查缓存，未命中目标语种才走 readProblem；缓存损坏／I/O 错误区别于未命中。成功结果投影完整正文，来源使用 site／translation，无读题时间、无 retrievedAt 冒充新官网观察；不把 run 额度套到题面。内部 roots 只在宿主初始化使用，沿现有 FileTools 和页面过滤阻止普通 read/list/find/search／readPage 探查缓存；不扩展为拒绝正常用户资产或改变显式主动材料合同。
- [x] **Step 5: 更新工具说明及七主题中的相关事实。** 用英文说明语种、缓存优先、不会自动翻译；readProblemRecord 保持行为工具。旧已完成工具历史原样读取，不修改弃分支或补造新语种。
- [x] **Step 6: 重跑相关测试和 Beacon 全套。** 预期所有模式有相同精确取文语义，缓存目录始终不可列举，联网结果不产生任何缓存／行为写入，普通压缩与恢复不重演 fetch。

## Task 7: 集成审查、文档与分层交付

**Files:** 当前功能相关的 `docs/beacon/{README,prd,architecture,foundation-design,tool-contract,implementation-status}.md`、`VISION.md` 中的必要边界说明、`extensions/becoder.beacon/README.md`、`extensions/becoder.oj-connect/README.md`、Beacon `resources/product-info/{problems,oj-connect,beacon}.md` 及 `UPSTREAM.md`。仅按实现后的事实更新，保留原归档和未交付事项；不新增不存在的英文扩展 README。

**Interfaces:** 以 Task 1–6 最终共同 DTO 为准；所有任务复核本文 Review Focus。计划是一个题面闭环，不能先对用户宣称半套缓存／翻译可用。

- [x] **Step 1: 自查并作一次独立只读集成 review。** 审查真实 Get → 缓存 → 用户翻译 → 发布 → UI／工具投影全链；重点核对来源变化、窗口关闭、跨窗口重复与无队列。只修具体缺陷，记录问题、范围与失效检查；执行方式由负责人选择后确定评审安排。
- [x] **Step 2: 更新现行文档与中文提示词语义。** 区分新增应用缓存和原 problem 行为队列；落实已审定中文文案、英文对应、无自动翻译和无工作区可用。提示词参考按实际借鉴更新来源记录，不引入外部产品运行时。
- [x] **Step 3: 执行下节最终源码矩阵。** 记录精确输入、开始／结束、退出码、失败分类与重跑；某检查失败先诊断修复，再跑受影响最小检查，不用前一版本通过证明当前代码。
- [x] **Step 4: 准备负责人验收材料（离线部分完成）。** 两方向含公式、样例、表格、代码的题目；原文／译文对照；语言栏与设置页在中英文／浅深色／宽窄的截图；真实模型输出和费用调用次数仅在后续获准真实服务验证后报告，不能从 mock 推定。
- [x] **Step 5: 按实际授权交付（本次仅源码）。** 已获构建授权时，按 AGENTS.md 关闭占用 stage 后执行三项标准命令，成功即停交负责人查看；未获构建授权则交源码检查结果。Setup、GUI 启动、commit、push 或 Release 需要各自授权，本计划不自动执行。

## Validation Entry Points

以下入口来自当前 package.json／AGENTS.md／实际脚本；实际执行结果记录在进度台账与实现状态中。每次 formal validation 前重新确认新增文件、依赖和配置存在，冻结实际输入；新文件的红灯测试只在已登记／构建后运行。

| 范围 | 精确命令 | 通过证据／上界 |
| --- | --- | --- |
| 核心类型 | `npm run typecheck-client` | exit 0；120 秒 |
| 核心转译 | `npm run transpile-client` | exit 0；120 秒，随后核心 Node 测试使用本轮 out |
| 缓存 Node | `npm run test-node -- --run src/vs/platform/browserView/test/node/ojStatementCache.test.ts` | 新增用例全过；120 秒 |
| 洛谷正文 | `npm run test-node -- --run src/vs/platform/browserView/test/common/luoguProtocol.test.ts` | 新旧协议回归全过；120 秒 |
| 内部页面权限 | `npm run test-node -- --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts` | 本轮 protectedRoots 回归及原权限不变；120 秒 |
| 原生应用／IPC | `npm run test-browser-session` | 原有 runner 加新增缓存服务项；隔离 Electron 组件；120 秒 |
| OJ 类型 | `npm --prefix extensions/becoder.oj-connect run typecheck` | exit 0；120 秒 |
| OJ 构建与回归 | `npm --prefix extensions/becoder.oj-connect run build`；`npm --prefix extensions/becoder.oj-connect test` | 分别 exit 0；各 120 秒 |
| OJ 页面 | `npm --prefix extensions/becoder.oj-connect run test-render` | 生产渲染断言及截图；120 秒 |
| Beacon 类型／构建 | `npm --prefix extensions/becoder.beacon run typecheck`；`npm --prefix extensions/becoder.beacon run build` | 分别 exit 0；各 120 秒 |
| 翻译纯内容 | `node --test extensions/becoder.beacon/dist-test/translationContent.test.cjs` | Task 3 新建 bundle 后；120 秒 |
| 翻译任务 | `node --test extensions/becoder.beacon/dist-test/translation.test.cjs` | Task 4 新建 bundle 后；120 秒 |
| Beacon 全套 | `npm --prefix extensions/becoder.beacon test`；`npm --prefix extensions/becoder.beacon run lint` | 分别 exit 0；各 120 秒 |
| Beacon 页面 | `npm --prefix extensions/becoder.beacon run test-render` | 生产渲染断言及截图；180 秒 |
| 分层 | `npm run valid-layers-check` | exit 0；120 秒 |
| 核心 lint | `node node_modules/eslint/bin/eslint.js --config eslint.config.js <本轮核心TS文件的实际列表>` | 现有 `npm run eslint` 不接收范围参数，使用已验证的 CLI；执行前按 git 状态列实参，排除目录／删除项；120 秒 |
| 样式 | `npm run stylelint -- extensions/becoder.beacon/webview/beacon.css`；`npm run stylelint -- extensions/becoder.oj-connect/webview/styles.css` | 每次单一现有路径；对照既有诊断，不把 exit 0 当零诊断；各 120 秒 |
| 文档 | `& '.\.agents\skills\develop-becoder\scripts\validate-project-docs.ps1'`；改动 Markdown 本地链接校验；`git diff --check` | 结构、链接和语义分开记录 |
| 标准 stage，仅获授权后 | `npm run typecheck-client` → `npm run compile-oi-extensions` → `npm run gulp vscode-win32-x64-min` | 顺序执行，120／120／300 秒；完成后停止，不自动启动／打 Setup |

跨批次和发布竞争测试必须使用显式 barrier，不依赖短睡眠或文件时间戳。任何未启动、缺入口、缺依赖或无效输入属于编排失败，不能算测试红灯或源码通过。标准构建的运行时下载若受网络影响，只按仓库现有恢复途径处理并核验对应版本／哈希，不升级运行时绕过失败。

## 计划自审与执行选择

- 本计划将设计第 2 节的缓存／语种／工具边界落实在 Task 1、2、6；翻译／配置／交互落实在 Task 3、4、5；来源与验收落实在 Task 7。所有 Review Focus 均有对应测试。
- DTO 和方法名跨任务以“贯通类型”及 Interfaces 为准，新增包构建／测试登记放入其拥有者任务；不新建数据库、并行模型框架或第二份服务商配置。
- 负责人已选择 Native 并确认实施。源码步骤与已执行离线验证按实际勾选；真实模型、原生 GUI 与 stage 未执行，不以 mock 或截图代替验收。
- 采用 Native：主代理顺序实现，末尾一次独立只读评审。复核的五项具体缺陷已逐项补回归并修复；没有并行写入、Git 发布或 stage 构建。

## 本次执行结果

2026-11-28：Native源码实施与直接验证完成，未commit／push。最终结果见[实现状态](../../beacon/implementation-status.md#2026-11-28-题面缓存与中英翻译)；本地进度与完整输出保留在`.superpowers/sdd/2026-11-28-problem-statement-translation/`。本轮原生所有者增加只读`merge`，在一次缓存快照中规范化比对原稿并补充已有语种，避免跨进程字段顺序差异和多次读取混合版本。类型／lint约定同步注册新增GPL源码路径，不改许可证。

执行复选框记录源码和离线检查。Task 7 Step 4的双向对照为确定性夹具，截图为生产Webview的隔离浏览器结果；真实模型译文、原生GUI、stage和负责人验收未执行。Step 5按本次授权停止于源码交付，不隐含后续构建或Git授权。
