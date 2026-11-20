# 蓝桥公开题库接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为蓝桥公开普通 C/C++ 编程练习接通源码识题、统一题面、同源码 CPH、单次提交及正式评测记录，保护现有四站闭环。

**Architecture:** 扩展拥有站点适配、偏好和共同界面；浏览器宿主拥有真实 BrowserSession、账号及固定网络操作。新增蓝桥专属 protocol、transport、SessionClient 和 bridge，复用既有控制器，不抽象重写四站协议。内部逐任务验证，完整候选闭环后交付一个最终 stage。

**Tech Stack:** 现有 TypeScript、Electron 原生 Session/net.request、现有静态解析依赖及洛谷 React/Webview 组件；不新增生产依赖或外部浏览器依赖。

**Spec:** [已批准设计及本轮交付决定](../specs/2026-11-19-lanqiao-public-practice-design.md)。执行者必须同时阅读设计与本计划。

**状态：任务0必要来源、任务1–6、统一审查修复及任务7源码检查和stage交付已完成；2026-11-20负责人确认蓝桥核心闭环验收通过。** 基线 `OJ_connect@ce98c93aceeee40bbf09220fd0a1a327dd8f5409`。原接入由主代理顺序实施、内部验证并交付单个最终stage；随后按新要求补齐评测阶段反馈，最终stage于同日08:54:45构建成功，本轮视觉效果仍独立验收。负责人已另行明确授权正式本地commit并发布至 `origin/OJ_connect`；Setup和后续真实新交题未纳入该授权。下列清单保留批准时的任务与边界，执行结果和当前状态以[实施记录](../../oj-connect/lanqiao-implementation-2026-11-20.md)为准。[运行时契约](../../oj-connect/lanqiao-runtime-contract.md)及[执行路径补证](../../oj-connect/lanqiao-execution-evidence-2026-11-20.md)记录真实来源及采证编排失败，不以实现计划或合成数据代替官网证据。

## Global Constraints

- 仅公开普通 C/C++ 编程练习；排除课程 lab、运行中赛事、考试、云环境挑战、交互题、权益管理、题解和社交；实际权限与题型须逐题核对。
- `lanqiao/254.cpp`；站点目录内或显式官方 URL 可识题，目录外通用 `254.cpp` 不自动认领蓝桥；只剥离已采证导航筛选参数，不丢弃业务上下文。
- 蓝桥首次 `C++（g++17）/cpp`、`C（gcc8.3.0）/c`；有效偏好优先，失效须重选；四站 C++20/C17 向上偏好保持。标签不证明实际标准、版本、O2 或 msys2。
- Cookie 留真实浏览器宿主；不复制 profile，不改 UA、TLS、代理、证书、sandbox，不提供任意 URL、脚本或 storage 读取能力。
- source、report 各至多一次，宿主内存权限在 dispatch 前同步消费；每窗口立即拒绝并发，无等待队列、重放、自动网页回退或持久事务库。
- 执行 ID 不是正式 RecordRef；正式详情须核对题目、语言、CRLF→LF 后源码及原账号上下文。受理不明、取消或超时后仅 GET，包括未发 report 的任务也不补 POST。
- 保留源码、未保存稿、样例空白和同源码绑定；不采集或展示隐藏测试输入输出、答案、原始 result；报告逐点只保留当前记录内存投影。
- 复用洛谷界面和英文判词；操作提示中英同步；真实零值保留，缺失字段省略，未知状态保留；官网 kb/MB 基数不明时不改写为 KiB/MiB。
- Global/Workspace 快捷键和提交边界保持；Browser Get 按当前页面 Session，包含四站原有临时会话路径；不复制临时登录到持久 Session。
- 内部不交付中间 stage；最终仅用匹配的已有 Electron 归档构建，失败须记录并修复。Setup、Git 发布、真实交题和 GUI 验收分别授权。

## Review Focus

1. 目录外数字文件、带业务 query 或变形官方 URL：不能误认题目或丢失上下文；由任务 1 的 resolver/域校验测试锁定。
2. 首次 Cookie 补设、同账号轮换、换号及迟到响应：读取不能取消自身，旧身份不能授权发送；由任务 3、5 的 revision/generation 测试锁定。
3. `.c` 与 `.cpp` 的限制和默认项不同：题面、快捷键及 prepare 使用同一语言族；由任务 2、4 测试锁定。
4. source/report 响应丢失、取消、404：不能重发或把旧 AC 认作本次记录；由任务 5 的计数与关联断言锁定。
5. 254 教学围栏、缺少测试点、真实零值及“cpp”源码查看：不能误导 CPH、伪造评测或把 C++ 当 C；由任务 2、6 测试锁定。

## 证据与执行顺序

已取得的证据见[真实产品会话验证](../../oj-connect/lanqiao-native-session-evidence-2026-11-19.md)：默认安全配置下原生三源 GET、真实登录首屏、负责人人工登录、同 Session 本人题目与旧正式记录读取；官网曾有一次 C++ AC。任务 0 另已取得当前官网版本的无凭据语言目录静态提取证据，详见[运行时契约](../../oj-connect/lanqiao-runtime-contract.md)。这些证据不证明真实产品原生 POST 已通过验收，也不证明长期或跨进程登录稳定。

顺序固定为：负责人审阅本计划 → 任务 0 补齐契约 → 任务 1–4 读取与本地衔接 → 任务 5–6 提交和评测 → 任务 7 最终回归及 stage。前两项全部满足前不改产品代码。无独立部署的中间版本；任务 0 未闭合时不运行依赖它的后续任务。

负责人已选择主代理顺序实现全部任务，最后统一审查；不逐任务分派实现或审查。必要的独立只读证据调查不改变该执行方式，同一文件同一时段只有一个写入者。

## 文件与所有权

下表定义批准的文件所有权；实际实现与验证状态见[实施记录](../../oj-connect/lanqiao-implementation-2026-11-20.md)，不能仅以计划条目推断已验收。创建文件前须再读各所有者至少两个邻近文件；四站 adapter、事务和原始 Companion 蓝桥 parser 不作重写。

| 所有者 | 新建 | 修改已有入口 |
| --- | --- | --- |
| 扩展站点 | `extensions/becoder.oj-connect/src/adapters/lanqiao/{task,adapter}.ts` | 同扩展 `src/adapters/adapter.ts`、`src/domain.ts`、`src/browserHost.ts`、`src/browserProblem.ts`、`src/extension.ts`、`src/problemResolver.ts` |
| 偏好与面板 | 无第二套偏好存储 | 同扩展 `src/preferences.ts`、`src/compilerCatalogue.ts`、`src/workflowController.ts`、`src/views/{problemPanel,loginModel}.ts`；`package.json`、两份 package.nls 及现有 l10n 文件 |
| 主进程 | `src/vs/platform/browserView/electron-main/lanqiao{Protocol,Transport,SessionClient}.ts` | `src/vs/platform/browserView/electron-main/browserViewMainService.ts` |
| 受限桥接 | `src/vs/platform/browserView/common/lanqiaoBridge.ts` | `src/typings/becoder-oj-connect.d.ts`、`src/vs/platform/browserView/common/browserView.ts`、`src/vs/workbench/contrib/browserView/electron-browser/features/{browserOjConnectFeature,browserProblemFeature}.ts` |
| 验证 | 对应扩展、common、electron-main 测试；`scripts/build-lanqiao-session-fixture.mts`、`scripts/test-lanqiao-session.cts`、`scripts/run-lanqiao-session-tests.mts` | 根 `package.json` 的新验证脚本；既有四站共同测试、扩展 `test/render.mts` |
| 文档 | 任务 0 的 `docs/oj-connect/lanqiao-runtime-contract.md`；实施后的独立验收记录 | 本设计／计划、`docs/oj-connect/{README,architecture}.md`、扩展 README；历史采证只追加有来源的后续事实 |

## Task 0：闭合执行地址与语言目录契约

**Files:** 补充现有蓝桥证据文档，新增 `docs/oj-connect/lanqiao-runtime-contract.md`；此任务不改产品代码。

**Interfaces:** 输出后续任务唯一采用的执行 URL 白名单、固定请求 schema、目录获取与题型判定契约，以及最小脱敏 fixture。官网实际值必须来自可追溯证据，不能从本计划反向生成“官网事实”。

- [ ] **Step 1 — 核对缺口。** 既有回执只保留 opcenter origin、query 键及 ID，未保留完整 pathname；定点恢复返回 `SAFE_PROJECTION_UNAVAILABLE`，不能据此推断路径或 Set 内容。只读盘点已有材料，不重新激活 inspector、恢复已停止的 UI 路线或自动实交。
- [ ] **Step 2 — 冻结执行地址。** 记录可信来源、原始路径结构的安全投影、执行 ID 位置、允许 query 键／值形状、原 origin 与官网 `/opcenter` 改写关系、选择的唯一生产请求地址。不得因同域放行整个 API；来源缺失则保持阻断。若必须新实交，先提供题目、语言、完整稿／哈希、一次 source／一次自然 report 上限及停止条件的卡片，等待用户动作或明确代理授权。
- [ ] **Step 3 — 冻结目录与题型获取。** 当前采证 `87ae9c7.js` 的 `availableLanguages` 是固定前端数组，不是目录 API。契约须给出当前版本发现入口、受限资源来源、提取位置／形状、C/C++ 标签/token、题型与本题允许语言证据、失败处理；仅有 `limit_details` 不算通过。先在已采材料验证静态字面量提取，不执行官网 JS。若无法在现有边界取得当前目录，回到设计修订，不能自动采用采证数组并称实时刷新。
- [ ] **Step 4 — 固定其余已知协议。** 主站 basic、题目 `/new/`、本人列表和正式详情 GET；source 字段 `language/submit_content/judge_client:2/is_submit:true`；report 字段 `submission_id/is_submit:true/problem_type:6/judge_client:2`。冻结账号字段、题型拒绝判据、执行停止条件、单位和未知状态行为；不能推断 report 幂等或落库时点。
- [ ] **Step 5 — 审查并解除证据阻断。** 验证来源、最小 fixture 与契约一致；如引入新产品选择先请负责人对齐。任何未获证实的必要来源、扩大传输权限或真实动作授权缺失都保持阻断；不以文档检查成功代替协议证据。

## Task 1：站点身份、领域校验和识题

**Files:** 新建扩展 `src/adapters/lanqiao/task.ts`、`test/lanqiaoTask.test.ts`；修改扩展 `src/domain.ts`、`src/problemResolver.ts`、`src/browserProblem.ts`、`src/adapters/adapter.ts` 及仓库 `src/typings/becoder-oj-connect.d.ts`；测试扩展 `test/domain.test.ts`、`test/problemResolver.test.ts`。

**Interfaces:**

- `lanqiaoProblem(input: string): ProblemRef | undefined`；正整数题号，规范 URL `https://www.lanqiao.cn/problems/{id}/learning/`。
- `ProblemReadOptions { readonly family: 'c' | 'cpp' }` 放共享 typings；`OjAdapter.readProblem(problem, signal, options?: ProblemReadOptions): Promise<ProblemDocument>` 向后兼容四站。
- `validateLanguageCatalogue(raw: unknown, site: SiteId): LanguageCatalogue`，所有调用传可信站点；`validateProblem`内嵌目录同步使用该规则。蓝桥只接受同族 `c/cpp`，四站保留现有校验，不整体放宽成任意字符串。
- `validateRecordRef` 只在蓝桥分支接受 `[0-9a-f]{24}` 与 `/problems/{pid}/submissions/{sid}/`；四站保留正整数及原规范地址。

- [ ] **Step 1 — RED。** `lanqiaoDirectoryOrExplicitUrl` 断言 `lanqiao/254.cpp` 与显式 URL 得到本站254，目录外 `254.cpp` 为 `inputRequired`；自定义目录、冲突域名、凭据／端口／控制字符／业务 query 被拒绝，已采导航筛选参数可规范化。
- [ ] **Step 2 — RED。** `lanqiaoOnlyTokensAndRecordIds` 断言蓝桥接受 `cpp/c` 与已采24位 ID，四站拒绝这些本站例外，蓝桥拒绝数字记录ID、跨题详情及不匹配 URL。
- [ ] **Step 3 — 最小实现。** 扩充 adapter 联合与域分派；数字 resolver 不进入目录外全站猜测；纯模块 `src/browserProblem.ts` 加入蓝桥resolver供宿主Get使用，无需激活扩展；宿主仍独立核验输入和实际页面，不能信任扩展参数。
- [ ] **Step 4 — GREEN。** 扩展 typecheck 后运行对应测试，保留四站原断言；RED 必须是预期行为断言失败，依赖或入口错误不计 RED。

## Task 2：纯题面、样例和结果协议

**Files:** 新建 `electron-main/lanqiaoProtocol.ts` 和 `test/electron-main/lanqiaoProtocol.test.ts`，均相对 `src/vs/platform/browserView/`；最小 fixture 随拥有者测试维护。

**Interfaces:**

- `parseLanqiaoProblem(problem: ProblemRef, raw: unknown, options: ProblemReadOptions): ProblemDocument`：先校验任务0题型/访问结构，再处理 `question_stem`；C/C++ 资源限制按官方标签映射，单位保持官网含义。
- `parseLanqiaoLanguages(rawSource: string): readonly LanguageOption[]`：按任务0冻结的单一结构静态提取；未知结构明确失败。
- `parseLanqiaoRecord(ref: RecordRef, raw: unknown): RecordSnapshot`：校验同ID/题目/语言，保留可读源码供 client 关联；未匹配前 `sourceVerification:'not-checked'`。
- `projectLanqiaoReport(raw: unknown): LanqiaoReportProjection`：本站内部类型仅含正式状态、允许的诊断及点序/结果/耗时/内存；没有原始 result、隐藏输入输出或答案属性。

- [ ] **Step 1 — RED。** `tutorialFencesAreNotSamples` 用254最小真实结构，断言只提取 `1 2` → `3` 一组；教学代码、样例说明、围栏语言和空白不误配。缺少明确输入/输出配对时不给CPH伪样例，题面保留原文。
- [ ] **Step 2 — RED。** `languageSpecificLimits` 人工构造不同 C/C++ 限制，断言源码族决定显示；C标签与c token分别映射，缺失不使用另一族或本地默认冒充。人工fixture明确非官网样本。
- [ ] **Step 3 — RED。** `summaryAndPointProjection` 覆盖已采AC、未知状态、0值、无点、CE诊断存在/缺失、只有失败布尔值；失败布尔值不推断WA/TLE，通过率不当分数，`elapsed_minutes`不当程序耗时，隐藏result不进入输出。
- [ ] **Step 4 — 最小实现并GREEN。** 用已有安全Markdown/AST和静态字面量工具，按语义标题分样例；限制正文/数组/字段大小，拒绝错误对象、冲突身份及非有限资源数值；不引入页面执行或新依赖。

## Task 3：原生固定读取、账号与 Session 所有权

**Files:** 新建 `electron-main/lanqiaoTransport.ts`、`lanqiaoSessionClient.ts` 及同目录归属的 `test/electron-main/lanqiao{Transport,SessionClient}.test.ts`；修改 `common/browserView.ts`、`electron-main/browserViewMainService.ts`。

**Interfaces:**

- `createLanqiaoTransport(session: Session): LanqiaoTransport`；内部 `request(operation: LanqiaoOperation, signal: AbortSignal): Promise<LanqiaoResponse>`，discriminated union列出任务0固定GET与source/report操作，不向扩展暴露URL、headers或fetch。
- `LanqiaoSessionClient` 提供 `loginSummary(signal)`、`readProblem(problem, options, signal)`、`readLanguages(problem, signal)`；只返回既有安全DTO。宿主以窗口和真实Session绑定client，账号generation/凭据revision留主进程。
- `openLanqiaoSession(windowId, scope): Promise<string>` 按原持久会话边界用于快捷键／提交；`readOjProblem(id, windowId, problem, options?)` 的新增可选参数接通客户端。Browser Get另从已验证页面的真实Session取只读client，不把viewId误作SessionId。

- [ ] **Step 1 — RED。** `fixedTargetsOnly` 拒绝任意host/path、凭据URL、未知query、越界响应、重定向及无效JSON；凭据仅由真实Session附带。单请求15秒、响应上限4MiB、源码上限1MiB，POST不自动重试或跟随307/308。
- [ ] **Step 2 — RED。** `firstCookieDoesNotCancelRead`、`staleAccountCannotAuthorize`：同号轮换不作退出；账号请求中revision变化最多补读一次，持续变化明确失败；换号/明确退出使准备、记录与迟到读取失效。401为未登录，403/网络错误为unknown。
- [ ] **Step 3 — 最小实现。** 原生net.request使用当前Session、手动重定向与取消；首次读题只做必要固定GET，不导航网站、不读本人列表、不建立发送许可；目录读取不阻塞已取得题面，失败保留来源明确的采证预选，prepare必须取得当前目录。
- [ ] **Step 4 — GREEN。** 测窗口隔离、相同Session跨窗口通知、不同Workspace隔离、关闭/释放幂等、取消后无迟到文档、旧finally不删除新请求；所有read测试断言source/report次数均0。

## Task 4：受限命令、扩展装配与统一题面

**Files:** 新建 `common/lanqiaoBridge.ts`、`test/common/lanqiaoBridge.test.ts`，扩展 `src/adapters/lanqiao/adapter.ts`、`test/lanqiaoAdapter.test.ts`；修改文件表中的宿主features、扩展host/entry/preferences/catalogue/panel/loginModel及设置/本地化；对应既有测试扩充。

**Interfaces:**

- `ILanqiaoPrepared { readonly handle: string; readonly languages: readonly LanguageOption[]; readonly hasDraft: boolean }`、`ILanqiaoSourcePayload { readonly source: string; readonly fileName: string; readonly languageId: string }` 放共享typings；`LanqiaoAdapter implements OjAdapter`、`CommandLanqiaoHost` 复用既有SubmissionSession和RecordController。
- `LanqiaoBridgeController` 暴露 `prepare/send/cancel/release/readRecord/reconcile`；窗口内不可伪造handle和正式记录表，旧页面/身份不得授权新handle。固定命令前缀 `_becoder.ojConnect.lanqiao.`；`readProblem/readLanguages/loginSummary/login` 走固定语义入口及取消请求ID。
- `defaultLanguage(options, family, site?: SiteId): LanguageOption | undefined`：仅lanqiao采用批准例外，所有生产调用传site；`OjPreferences`保存本站 `c/cpp`。目录校验调用使用任务1站点参数。

- [ ] **Step 1 — RED。** `sameCompilerForPanelAndShortcut` 断言 `.cpp` 首次cpp、`.c` 首次c，有效本人偏好优先；失效偏好要求更换；采证项tooltip来源明确，prepare目录变化后同步面板；四站默认算法断言保持。
- [ ] **Step 2 — RED。** `sourceFamilyReachesStatement` 将快照family经adapter/command/main传至任务2；Browser Get创建cpp时显式cpp；同源码面板重开完整替换文档；局部协议不要求四站实现新选项行为。
- [ ] **Step 3 — RED。** `browserGetKeepsPageSession` 覆盖Global/Workspace/Ephemeral原页范围与导航取消；快捷键/提交仍拒绝Ephemeral；不读另一profile、不改变四站Get/Import to CPH路径。
- [ ] **Step 4 — 装配并GREEN。** 新增蓝桥adapter、语义命令、IPC方法、事件联合和releaseRecord分派；摘要实际可用后接侧栏人工Passport登录，未验证个人页路由时不猜地址，沿用固定登录入口；网络未知不显示退出。仅名称可点、原色图标和显式外部打开边界保持。
- [ ] **Step 5 — 设置与CPH回归。** 增加 `becoder.ojConnect.lanqiao.{cCompiler,cppCompiler}`，application scope、默认空串、仅本站token；中英文案同步。Get只打开源码和题面，题面CPH使用绑定源码与任务2样例；已有文件/未保存稿不覆盖、替换样例仍确认。不重写原Companion通用蓝桥parser。

## Task 5：source／execution／report 一次事务与正式回执

**Files:** 扩充任务2/3/4的蓝桥protocol/client/transport/bridge及测试；修改宿主main service、feature及必要workflow回归，不重写四站。

**Interfaces:**

- `LanqiaoSessionClient.prepare(problem, signal)` 返回本站内部ownerKey/generation和当前目录；`send(problem, payload, ownerKey, requestId, signal): Promise<SubmissionOutcome>` 在宿主固定快照与权限；`cancel(requestId)`、`reconcile(attemptId, signal)` 永不恢复POST。
- 宿主服务与bridge对应方法固定为 `prepareLanqiaoTask`、`submitLanqiaoTask`、`cancelLanqiaoTask`、`readLanqiaoRecord`、`releaseLanqiaoRecord`、`reconcileLanqiaoAttempt`；参数形状沿现有Nowcoder服务的id/windowId/problem/payload/ownerKey/requestId，只用本站DTO。
- 当前进程attempt保存题目、归一化源码、语言、账号、Session/generation、执行ID及source/report消费标记；record另行绑定，经核对才交付。每窗口busy立即拒绝并发，释放发送资源不删除仍需GET核对的attempt。

- [ ] **Step 1 — RED。** `sourceAndReportConsumedBeforeDispatch` 重复handle、并发send、迟到回调、同步dispatch异常及307均断言source≤1/report≤1。源码未dispatch可为not-sent，消费后不能凭网络异常声称未发。
- [ ] **Step 2 — RED。** `executionUrlIsNotReceipt` 只允许任务0精确结构，执行ID与回执一致；未知URL维持unconfirmed；`execute_status>=2`只停止执行查询，不成为AC或RecordRef。
- [ ] **Step 3 — 最小实现。** 按设计source→有限执行GET→一次report→正式详情GET顺序；自动跟踪总期限约120秒、首次轮询3秒、后续有界退避按任务0核准节奏，不复制官网未证实的300000超时含义。report dispatch前再次检查任务/账号/取消和独立消费标记。
- [ ] **Step 4 — RED→GREEN。** `cancelAndTimeoutAreGetOnly` 覆盖source回包丢失、执行超时、report前取消、report响应丢失及详情暂404；源/报告计数不增加。已知ID只GET原详情/必要本人列表，无ID不扫“最新AC”认领；未知业务错误不得称明确拒绝。
- [ ] **Step 5 — RED→GREEN。** `formalReceiptMatchesSnapshot` 核对同ID/题目/token/CRLF→LF源码、前后当前本人身份及本人列表；没有owner不编造owner核验。错语言、末尾空白不同、题目不符、旧ID不认领；report丢包但详情匹配可以确认。取消/换号/释放后不交付旧结果，重启不恢复attempt或report。

## Task 6：共同记录页和最小运行验证入口

**Files:** 扩展 `test/lanqiaoAdapter.test.ts`、`test/workflowController.test.ts`、`test/render.mts`；按真实需要修改现有记录转换入口；新增文件表中的3个session验证脚本及根package script。

**Interfaces:** `readRecord(record, signal): Promise<RecordSnapshot>` 返回官网语言完整标签，已核对源码 `sourceVerification:'matched'`；report逐点投影只挂当前进程所属记录；`releaseLanqiaoRecord`清理读请求及逐点内存，不能触发report。新根脚本 `test-lanqiao-session` 运行已有Node/Electron，按构建→离线fixture顺序执行。

- [ ] **Step 1 — RED。** `recordOpensOnlyAfterConfirmation` 在正式详情前不打开假记录；可能直接显示终态，有实际数量前仅整体等待；`cpp`显示官网C++名称，查看源码不能误作C。
- [ ] **Step 2 — RED。** `recordProjectionIsMemoryOnly` 验证汇总/逐点缺失、0用时/内存、英文状态/CE诊断、清理后不补POST、源码查看与滚动、内置标题链接；无隐藏测试内容与虚构Score。
- [ ] **Step 3 — GREEN及渲染。** 复用洛谷组件/CSS，禁止新增蓝桥独立页面；为准备中、终态AC、缺失点、未知判词、资源0、目录失败增加截图，人工核对英文判词和操作本地化。
- [ ] **Step 4 — 可复现离线宿主入口。** `build-lanqiao-session-fixture.mts` 用已存在esbuild打包真实main service，产物只写独立tmp；`run-lanqiao-session-tests.mts`解析实际electron包入口并spawn，校验退出/超时；`test-lanqiao-session.cts`采用独立profile并拦截全部HTTPS，意外目标立即失败，结束清理本实例。根 `test-lanqiao-session` 指向该runner，不依赖历史临时bundle或日常profile。
- [ ] **Step 5 — 离线运行验收。** `npm run test-lanqiao-session` 通过真实Electron Session断言登录摘要/读题/一次source/执行/report/详情、身份失效、0页面、0外网；此为合成运行证据，不冒充官网实交。四站原native测试如有过时bundle入口，须先预检并冻结实际构建/运行命令，禁止直接拿旧产物作回归。

## Task 7：最终审查、检查矩阵和一个 stage

**Files:** 按最终行为更新扩展README和 `docs/oj-connect/{README,architecture}.md`；新增 `docs/oj-connect/lanqiao-implementation-2026-11-19.md` 分列源码、构建、真实旅程和负责人验收。日期如跨日使用实际日期，不伪造11月19日执行。

- [ ] **Step 1 — 主代理自查与独立只读审查。** 对照设计全项检查范围/所有权/异常/安全/资源释放/文案/四站保护。处理具体缺陷，只重跑受影响检查；不得让之前审查替代后续改动审查。
- [ ] **Step 2 — 预检并冻结最终命令。** 依据下表和当前package/实际文件确认依赖、测试输出、现有ordinary文件及变更路径；记录cwd/超时/副作用/阻断条件。新脚本真正存在后才执行，测试前先跑拥有者typecheck或watch。
- [ ] **Step 3 — 跑完整源码矩阵。** 所有必需检查与真实失败均写台账；非零或外部超时均失败，区分编排/源码/外部原因，最小修复后重跑失效检查。最终矩阵须对应最终工作区。
- [ ] **Step 4 — 构建前检查现有缓存与stage占用。** 从 `build/lib/electron.ts`、当前Electron版本和checksum文件验证本地归档；用既有 `BECODER_ELECTRON_ARCHIVE` 支持传递到本次子进程，不改用户环境。缺失/不匹配则先停止，不尝试标准网络下载。stage运行时等负责人保存关闭，不强杀或覆盖运行产物。
- [ ] **Step 5 — 构建一个最终stage。** `npm run gulp vscode-win32-x64-min`，300秒外部上限；正常无中间打包。记录artifact路径/源码对应/退出；失败后保留缓存与旧产物，按授权范围诊断再构建，不把失败写成成功。不继续Setup/包核验/Git。
- [ ] **Step 6 — 交负责人真实旅程验收。** stage交付前完成所有不依赖真实账号的检查。随后用户在隔离真实产品中登录、看题、CPH、提交及查看正式记录；实际发送先用单独卡片，C++与C分别验证。四站按原旅程保护并单列实测，不为回归自动交题。缺证项保持未验收，不因stage成功宣称五站全部闭环。

### 实施时的命令基线

此表是待执行计划，不是通过记录；本轮仅做文档检查。所有命令在仓库根运行，扩展使用显式prefix。实际执行前重新预检，不能猜依赖内部路径。

| 检查 | 命令／入口 | 通过含义与限制 |
| --- | --- | --- |
| 扩展类型 | `npm --prefix extensions/becoder.oj-connect run typecheck` | 拥有者类型检查，无产物；随后才能把测试结果计为源码证据 |
| 扩展回归 | `npm --prefix extensions/becoder.oj-connect test` | 现有脚本编译site scripts及测试，全部断言和content parser通过 |
| core类型 | `npm run typecheck-client` | 120秒外部上限；不使用npm run compile代替 |
| core测试产物 | `npm run transpile-client` 或已就绪watch | 按package现行入口生成测试所需输出；它不是类型检查 |
| Node拥有者 | `npm run test-node -- --run src/vs/platform/browserView/test/common/lanqiaoBridge.test.ts` | 新文件编译输出存在后执行；纯protocol/client可用显式src路径加入Node清单，实际导入Electron的用例走原生fixture |
| workbench拥有者 | `node_modules/electron/dist/electron.exe test/unit/electron/index.js --run src/vs/workbench/contrib/browserView/test/electron-browser/browserOjConnectFeature.test.ts --run src/vs/workbench/contrib/browserView/test/electron-browser/browserProblemFeature.test.ts` | 使用已存在同版本Electron与正式runner；runner默认独立临时userData，无安装、无官网请求；不能改用缺少ipcRenderer的普通浏览器runner |
| 原生蓝桥合成 | `npm run test-lanqiao-session` | 任务6新增入口存在后执行；拦截全部外网，覆盖真实native传输/host |
| OI编译 | `npm run compile-oi-extensions` | 120秒外部上限；包含生产Webview bundle，结束后运行渲染 |
| Webview渲染 | `npm --prefix extensions/becoder.oj-connect run test-render` | 截图与人工核对分列，测试通过不等于视觉验收 |
| 层级与风格 | `npm run valid-layers-check`；`node_modules/.bin/eslint.cmd --max-warnings 0 <预检后冻结的现存变更TS文件>` | 使用已存在的Windows shim；根npm eslint脚本忽略文件参数，不用它冒充定向lint；CSS确有修改才加入现有stylelint入口 |
| 文档与差异 | `pwsh -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1`；`git diff --check` | 结构检查不替代语义审查；新增未跟踪文档另查链接和空白 |
| stage | `npm run gulp vscode-win32-x64-min` | 300秒上限，必须命中已核验本地Electron归档；仅构建，不代表运行验收 |

计划预检时已只读核对Node runner的src路径转换、Electron runner的重复 `--run` 参数、独立临时userData及eslint shim存在性；当时未运行它们。当前执行结果以实施记录和本地验证台账为准。执行前仍要核对最终测试输出与依赖，将新增protocol/client路径和原四站native合成的真实构建／运行命令记入台账。入口变化先记录并修正命令计划，不能把编排错误称源码失败，也不能静默省略该测试。

### 收敛条件

- 任务0契约有可信来源，全部产品任务经审查与最终必需源码检查通过；没有阻断缺陷或未说明的假设。
- 只交付一个完整候选stage；缓存/用户数据/现有四站能力保持，构建失败如实记录，源码与artifact一致。
- 蓝桥真实C++／C与四站保护的运行证据分别列出；尚未进行的真实动作或负责人视觉验收明确标记，不以合成或旧AC补齐。
- 负责人确认实际闭环后才更新“已完成接入”结论；后续commit/push/Setup另按明确授权执行。
