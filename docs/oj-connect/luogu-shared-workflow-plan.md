# OJ Connect 共同流程与洛谷接入实施计划

本文保留首次双站共同流程实施时的技术选型、接口与台账。随后已按固定上游 4.20.0 复用 React 前端，并将内容解析与高亮统一到共享模块；旧 DOM／markdown-it 方案及兼容转导出不是当前架构要求。扩展重复的 `src/adapters/luogu/protocol.ts` 已移除，实际协议转换及回归由核心 `common/luoguProtocol.ts`／`test/common/luoguProtocol.test.ts` 拥有；下文 `.mjs` 构建与页面测试文件现为同名 `.mts`，运行以 package.json 现行脚本为准。当前实现与负责人验收见[开发入口](README.md#当前实现状态)及[技术架构](architecture.md)，不因本文历史未勾选项恢复已移除入口。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 沿用当前会话直接实施方式；最终按技能作一次独立只读审查。计划已经负责人批准，按本会话继续实施；当前执行与验收状态见文末。

**Goal:** 让洛谷与 AtCoder 共用源码驱动的看题、导入、快捷键提交和评测界面，保留各站正确的认证与交题机制。

**Architecture:** 共同应用层编排题目、源码快照、语言及生命周期，共同 Webview 展示题面和记录；两站适配器提供原生内容、发送及更新。受限宿主持有真实浏览器会话与一次发送边界，CPH 通过明确的已有源码入口接收样例。洛谷协议先核实再实施，不将 AtCoder 表单步骤泛化成共同接口。

**Tech Stack:** TypeScript、现有 vscode API 与内置浏览器 IPC、Node test／Mocha、同版本 Electron。Webview 使用 TypeScript DOM、markdown-it、DOMPurify、KaTeX 和 esbuild；复用仓库已使用的版本并声明本扩展自己的构建依赖，发布时打入静态 bundle，不运行时引用其他扩展的 node_modules。

**Spec:** [共同流程与洛谷接入设计](shared-workflow-design.md)，负责人已整体确认。另读[产品入口](README.md)、[架构](architecture.md)、[AGENTS.md](../../AGENTS.md)和 [VISION.md](../../VISION.md)。

## Global Constraints

- 用户可见的题面页、评测页、快捷键和操作路径统一；各站差异由共同内容和状态表达。
- 当前基线为 `OJ_connect` 既有未提交工作树。执行前重新记录 HEAD、状态及已有文件快照；本计划不要求换空 worktree，不提交／推送、不删除审计材料。
- 保留 AtCoder 负责人确认的新版 Ctrl+Alt+S 闭环；旧 `80777721` 不代替新构建验收，不补造判定或源码核对结论。
- 默认目录精确为 `luogu`、`codeforces`、`atcoder`、`lanqiao`、`nowcoder`；目录设置修改不移动文件。直接父目录优先，再按文件名猜题，不建持久绑定库。
- 来源为当前本地 C／C++ 编辑稿，包括未保存修改；快照在用户提交动作发起时固定，不自动保存或改写解答。
- 每窗口同一时间一项提交任务；同一逻辑任务最多生成一条正式记录；明确验证码拒绝后允许人工验证再继续。发送不确定只查证，已有正式 ID 只查询，不自动重交。
- 认证与请求使用实际浏览器会话，用户手动登录／验证；不导出 Cookie、不增独立账号存储、不开放任意脚本或带登录态通用请求。
- CPH 负责本地测试；浏览器 Import 不创建 CPH 数据，题面明确点击后才关联同一份源码，保护现有样例和编辑稿。
- 移除打卡、犇犇、绘板、文章／专栏、题库、随机题、题单、题解、比赛列表／管理／监控及其隐式提交目标注入，不迁入它们的命令、设置、资产或后台任务。
- 首批只实现洛谷和 AtCoder；其余三站在登录摘要显示“尚未接入”，不凭其浏览器状态推断已登录。不扩张 Runner、安装或卸载职责。
- 依赖版本、英中文案、许可证、来源与包验证同步；不新装第二套 TypeScript／Electron，不直接改生成目录，不构建 Setup。
- 源码、合成 Electron、staged、包内容与两站真实验收分别成立；本计划获准执行也不授权代理自动处理登录、验证码或未经指定的真实交题。

## Review Focus

1. `luogu/AT_abc086_a.cpp` 与 `atcoder/abc086_a.cpp` 不串站，前者必须保持洛谷原生身份（Task 2）。
2. 登录／语言选择时切换编辑器或继续编辑，实际发送仍为最初明确文档的快照；取消晚到回调零发送（Tasks 3–5）。
3. 收到正式 ID 后断网、断推送、关闭记录页再查询，只读取同一 ID，不能第二次发送（Tasks 3–6）。
4. 导入时目录被替换为 junction、同名文件出现或已有 CPH 数据属于另一源码，保留用户资产并明确拒绝歧义（Task 7）。
5. 两站题面含公式、图片、多语言、空样例、缺失结果字段或外部脚本，页面一致且内容保真，外部内容不能触发命令（Task 6）。

## 契约与文件归属

所有新路径在 Tasks 中列明；`src/domain.ts` 是共同纯类型的扩展入口，类型来自编译期声明 `src/typings/becoder-oj-connect.d.ts`。将现有 `SiteId` 和 `ISourceSnapshot` 的字段原样移入该声明，settings／submissionController 保留类型转导出兼容消费者；`SiteDirectories = Record<SiteId, string>` 继续共用这一个五站类型。

```typescript
// 语义字段精确约定；readonly 应用于下面的值对象及其数组。
type ProblemRef = { site: SiteId; nativeId: string; url: string };
type Section = { heading?: string; format: 'markdown' | 'html'; content: string };
type ProblemDocument = {
  ref: ProblemRef; title: string;
  bodies: { locale: string; sections: Section[] }[];
  samples: { input: string; output: string }[];
  limits: { label: string; value: string }[]; interactive: boolean;
};
type LanguageOption = { id: string; label: string; family: 'c' | 'cpp' };
type RecordRef = { problem: ProblemRef; id: string; url: string };
type RecordSnapshot = {
  ref: RecordRef; phase: 'queued' | 'judging' | 'finished' | 'unknown';
  rawStatus: string; language?: string; owner?: string; score?: string;
  time?: string; memory?: string; compileMessage?: string;
  groups?: { name: string; rows: string[][] }[];
  sourceVerification: 'matched' | 'mismatch' | 'unavailable' | 'not-checked';
};
type SubmissionProgress = { phase: 'preparing' | 'interaction' | 'sending' | 'confirming'; message: string };
type SubmissionOutcome =
  | { kind: 'record'; record: RecordRef }
  | { kind: 'not-sent'; reason: string }
  | { kind: 'unconfirmed'; problem: ProblemRef; message: string; attemptId: string };
type LoginSummary = { site: SiteId; state: 'signed-in' | 'signed-out' | 'unknown' | 'unavailable'; label?: string };
```

`nativeId`、语言 ID 与 `attemptId` 均视作不透明标识，站点适配器校验。记录 URL／题目／站点需互相对应；`finished` 与 `rawStatus` 分开，不认识的判定不推断成功。测试点以分组／表格组件呈现，缺失字段不补默认分数。正文语言代码来自实际页面／响应，不强制只接受中英。

```typescript
// 只在扩展进程内存在；方法和 AbortSignal 不作为 IPC 参数。
interface SubmissionSession {
  languages: readonly LanguageOption[];
  hasDraft: boolean;
  send(input: { snapshot: ISourceSnapshot; languageId: string; replaceDraft: boolean },
    progress: (value: SubmissionProgress) => void, signal: AbortSignal): Promise<SubmissionOutcome>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}
interface OjAdapter {
  readonly site: 'luogu' | 'atcoder';
  resolve(input: string): ProblemRef | undefined;
  fileName(problem: ProblemRef): string;
  readProblem(problem: ProblemRef, signal: AbortSignal): Promise<ProblemDocument>;
  loginSummary(signal: AbortSignal): Promise<LoginSummary>;
  prepare(problem: ProblemRef, sourceUri: string,
    progress: (value: SubmissionProgress) => void, signal: AbortSignal): Promise<SubmissionSession>;
  readRecord(record: RecordRef, signal: AbortSignal): Promise<RecordSnapshot>;
  reconcile(attemptId: string, signal: AbortSignal): Promise<SubmissionOutcome>;
}
```

`SubmissionSession` 是本次操作闭包，不要求网站必须存在页面或表单。宿主给需要它的站点发放窗口／session 绑定的临时句柄；共同层不制造页面句柄。`reconcile` 只能检查已有发送尝试，不恢复自动发送。会话 dispose 必须释放发送能力与观察器，但发送待确认时保留核对所需的只读尝试上下文，最多 10 分钟、仅当前窗口内存；超过期限或关闭窗口后明确提示无法继续自动核对，不重新发送。扩展结束即撤销发送权限；只读上下文不包含可供扩展导出的凭据。

`RecordController.track(ref, onUpdate, signal): Promise<void>` 统一串行读取，以 2 秒间隔、2 分钟跟踪上限起步；终态结束，达到上限保留 ID 并允许明确继续查询。登录摘要仅在视图显示／刷新以及已知登录交互结束后检查，不建立五站长期轮询。精确期限是本计划的起始实现值，不能覆盖现有 AtCoder 发送事务的防重期限。

宿主新增固定业务命令统一放在 `_becoder.ojConnect.atcoder.*` 和 `_becoder.ojConnect.luogu.*` 下，由 `browserHost.ts` 绑定到具体适配器；注册时宿主自行取得窗口身份。下面 Tasks 对传输方法命名，不引入按字符串调用任意站点动作的公开总线。

## Task 1: 固定洛谷来源与真实协议证据

**Files:** Create `docs/oj-connect/luogu-protocol-evidence.md`；脱敏页面／响应保存在忽略目录 `tmp/oj-connect-audit/luogu/`。不修改产品代码。

**Interfaces:** 输出 evidence 表，逐项记录官方 URL／动作、必要请求字段、响应字段与类型、登录要求、失败响应、正式 ID 来源、记录终态和更新方式；每项标明源码参考、匿名实测或账号实测，不留模糊的“接口可用”。

- [ ] **Step 1:** 固定本地 4.18.2 VSIX 的 SHA-256；若复用上游源码，固定 commit 和许可证。仅审查核心使用链，不迁入全插件。
- [ ] **Step 2:** 匿名读取洛谷练习题、题面结构和可得语言；记录 DOM／JSON 的真实样本。复核 AtCoder 当前题面语言及提交后正式详情结构，保留现有证据。
- [ ] **Step 3:** 由用户手动登录专用浏览器；先确认洛谷指定练习题、解答与测试提交范围，再验证登录摘要、提交回执及记录读取。代理不自动交题；不能把旧“官方接口”称呼当作官方稳定 API 承诺。
- [ ] **Step 4:** 固定站点 recipe：采用当前实测的同 session 接口路径或官网表单路径，注明 CSRF／验证码等待与单次发送边界。脱敏样本只保留解析所需数据，不保存凭据或请求头全集。
- [ ] **Step 5:** 记录门禁结论。Task 2 与共同纯模块可独立推进；Task 5 的网站实现必须依据已核实证据补全 recipe 细节后开始。若两种路线均未验证，不模拟出成功，不开放洛谷发送入口；报告具体阻塞和已有共同层成果。

## Task 2: 共同模型与双站简单题目解析

**Files:** Create `extensions/becoder.oj-connect/src/domain.ts`、`src/adapters/adapter.ts`、`src/adapters/registry.ts`、`src/adapters/luogu/task.ts`、`test/domain.test.ts`；modify `src/problemResolver.ts`、`src/adapters/atcoder/task.ts`、`src/typings/becoder-oj-connect.d.ts`、`test/problemResolver.test.ts`。除声明外均相对扩展根。

**Interfaces:** `resolveProblem(filePath: string, directories: SiteDirectories, adapters: readonly OjAdapter[]): { kind:'problem'; problem:ProblemRef } | { kind:'inputRequired'; site?:SiteId } | { kind:'unsupported'; site:SiteId }`。`adapterFor(site: SiteId): OjAdapter | undefined` 只取得已注册双站适配器。

- [ ] **Step 1:** 写 RED：`luogu/P1001.cpp`→洛谷；`luogu/AT_abc086_a.cpp`→洛谷收录题；`atcoder/abc-86_a.cpp`→AtCoder ABC086 A；`nowcoder/abc086_a.cpp`→unsupported；自定义目录与失配正确。断言 `assert.equal(resolve(...).problem.site, 'luogu')`，没有站点目录且存在多解时返回 inputRequired。
- [ ] **Step 2:** 运行 `npm --prefix extensions/becoder.oj-connect test`，确认失败位于新解析需求，然后实现声明、纯模型校验和同一解析入口。保留原站题目标识；输入官方链接可取得站点，失配不后台试投。
- [ ] **Step 3:** 双站 `fileName` 使用可反向解析的安全单文件名：洛谷 P1001→`P1001.cpp`、AtCoder ABC086 A→`abc086_a.cpp`；额外合法 PID 与显式比赛题上下文按 Task 1 的真实标识规则处理，不从比赛监控取值。
- [ ] **Step 4:** GREEN：题目／记录 URL 串站、无效正文、过大数据、未知状态和缺失可选字段的校验覆盖；正文样例不因模型转换 trim。运行扩展 typecheck 和 test。

## Task 3: 共同提交与记录控制器

**Files:** Modify 扩展 `src/submissionController.ts`、`src/extension.ts`、`test/submissionController.test.ts`；create `src/recordController.ts`、`src/operationError.ts`、`test/recordController.test.ts`。保留现有 `ISourceSnapshot`；`OjAdapter` 来源为 Task 2。

**Interfaces:** `SubmissionController.submit(snapshot: ISourceSnapshot, explicitProblem?: ProblemRef): Promise<SubmissionOutcome | undefined>`；`cancel(): Promise<void>`、`dispose(): Promise<void>`；消费共同 `RecordController.track`，UI 端口提供题目输入、语言选择、草稿确认、进度和 `openRecord(ref)`。

- [ ] **Step 1:** 写 RED：两个行为不同的适配器共用控制器；语言记忆以 `site + family` 为键；选语言屏障后编辑另一文件仍发送最初快照；题面指定题目与源码来源明确；`assert.equal(sent[0].snapshot.source, 'first\n稿\n')`。
- [ ] **Step 2:** 写 RED：并发忙、拒绝草稿、准备中取消及 late prepare 完成均不发送；已得到 ID 后读取失败、2 分钟到期或关闭页，`assert.equal(sendCount, 1)`，只允许继续查询／核对。
- [ ] **Step 3:** 实现共同控制器及结构化错误：`stage: 'prepare'|'send'|'confirm'|'track'`、`delivery: 'not-sent'|'unconfirmed'|'record'`、可读 message 与可用动作。不能只通过错误字符串猜测是否发送，普通界面不暴露内部错误 token。
- [ ] **Step 4:** 实现记录串行读取、终态结束、AbortSignal 取消、显式继续查询及只读 reconcile；共用控制器不依赖 AtCoder URL、数字语言 ID 或页面句柄。扩展 typecheck/build/test GREEN。

## Task 4: AtCoder 适配与及时返回正式记录

**Files:** Create 扩展 `src/adapters/atcoder/adapter.ts`、`test/atcoderAdapter.test.ts`；modify `src/browserHost.ts`、共享声明、`browserOjConnectFeature.ts`、`browserView.ts`、`browserViewMainService.ts`、`atcoderBridge.ts`、`atcoderSubmission.ts`。这些核心文件沿用 architecture.md 已列绝对所属目录。新增核心 `src/vs/platform/browserView/electron-main/atcoderTransaction.ts`、对应 `test/electron-main/atcoderTransaction.test.ts`，抽取本次发送事务，不改其他浏览器功能。

**Interfaces:** 固定业务方法 `sendAndConfirmAtCoderTask(id: string, windowId: number, expectedURL: string, payload: IAtCoderSourcePayload): Promise<SubmissionOutcome>`、`readAtCoderRecord(id: string, windowId: number, record: RecordRef): Promise<RecordSnapshot>`，DTO 从共享声明取得；已存在的 `submitAtCoderTask` 保留为工具栏兼容包装。新增私有 `atcoder.sendAndConfirm`、`atcoder.readRecord`、`atcoder.reconcile` 命令并更新类型明确的 host 调用；旧 `IAtCoderBridge.submit` 不偷换返回类型。扩展 `AtCoderAdapter` 实现 Task 2 的 `OjAdapter`。

- [ ] **Step 1:** 写 RED：验证码尚未就绪零 POST，成功后一次 POST；排除旧 ID10，确认 ID11 后即返回 record，不等最终 AC；独立读取依次 WJ→AC。原本完整事务包装仍能得到原结果，`assert.equal(posts.length, 1)`。
- [ ] **Step 2:** 抽出已有基线／填稿／单次发送／候选与源码核对流程，供新业务方法和旧包装共用。保留页面世代、归属、手动 Submit、延迟验证、歧义拒绝和扩展停止等原有防重措施。
- [ ] **Step 3:** 增加固定 `readRecord` 命令，只读取明确 record 的数据；本人源码无法读取时可返回可得元数据并注明 verification，不把私有源码错误变成整条记录不存在。请求期间导航或 ID 被替换则拒绝旧结果。
- [ ] **Step 4:** 适配器将桥封装在本次 session 闭包内，向共同层只暴露语言、发送结果及更新；首次需要登录时保留任务与源码，在原请求有效时等待用户完成后继续，不要求再按一次提交。发送前取得已确认目标页面的新句柄，不能复活登录导航前的旧句柄。实现只读 attempt 保留／过期与 reconcile，不能在 finally release 中把核对状态一并丢失。
- [ ] **Step 5:** 扩展／核心聚焦测试 GREEN，更新真实 Electron 合成脚本，保留此前全部边界用例。原生工具栏与实验记录读取继续可用，不在此次删除。

## Task 5: 洛谷核心适配与双站题面／登录读取

**Files:** Create 扩展 `src/adapters/luogu/adapter.ts`、`src/adapters/luogu/protocol.ts`、`site-scripts/entry.ts`、`site-scripts/luogu.ts`、`site-scripts/atcoder.ts`、`build-site-scripts.mjs`、`tsconfig.site-scripts.json`、`package-lock.json`、`test/luoguAdapter.test.ts`、`test/siteScripts.test.ts` 与脱敏 fixtures；modify manifest scripts／devDependencies、`tsconfig.test.json`、`src/browserHost.ts`、共享声明、`browserOjConnectFeature.ts`、`browserView.ts`、`browserViewMainService.ts`。Create 核心 `common/luoguBridge.ts`、`test/common/luoguBridge.test.ts`（均在 `src/vs/platform/browserView/` 下）。

**Interfaces:** `LuoguAdapter` 实现共同契约；两站宿主分别提供固定 `readProblem`、`loginSummary` 操作。洛谷另提供 `prepare`、`send`、`readRecord`、`reconcile`、`cancel`、`release` 固定操作；参数只为各自 DTO，不接受 URL 请求模板／自带脚本。主进程调用形如 `readOjProblem(id: string, windowId: number, expected: ProblemRef): Promise<ProblemDocument>`；按 site 固定选择随包脚本，不执行扩展传来的代码。

- [ ] **Step 1:** 先检查 Task 1 门禁和脱敏契约。缺失真实发送证据时只允许实现读取与纯模型测试，发送部分明确停在门禁，不猜 DOM／接口。将经核实 recipe 的字段和响应条件补进协议证据后才写网站交互代码。
- [ ] **Step 2:** RED：洛谷有效回执 ID 可直接关联本次记录；网络断开发送结果 unconfirmed，不自动重 POST；再次查询读同一 attempt；错站回执、账号变化、页面世代变化、取消后晚到验证均拒绝。登录摘要读取失败为 unknown，不能变成 signed-out。
- [ ] **Step 3:** 实现受限宿主会话与洛谷 session 闭包。认证材料与 CSRF 留在宿主；后台推送若采用须绑定同 session，无法确认则使用已验证的只读查询路径。本任务声明 esbuild0.28.2／jsdom26.1.0 开发依赖，建立 `compile-site-scripts: node build-site-scripts.mjs`、DOM typecheck 与测试配置，build／test 前生成 `dist/site-scripts.js`；宿主只从该固定资源加载，重定向和未知动作失败关闭。
- [ ] **Step 4:** 双站 `readProblem` 返回共同正文、语言和样例；可复用现有 CPH parser 的样例逻辑，正文另提取，不能把只有样例的 Companion 对象冒充完整题面。`loginSummary` 从明确的当前会话证据读取，公开题页或 Cookie 存在不算登录。
- [ ] **Step 5:** GREEN：两站 HTML／Markdown、输入输出空白、单位、多语言和缺字段 fixtures；模拟站点脚本跨站请求、导航、重定向与账户变化；没有真实网络的测试不宣称真实站点可用。跑扩展、核心 bridge 与 Electron 发送合成检查。

## Task 6: 共同题面与评测 Webview、快捷键接入

**Files:** Create 扩展 `src/views/problemPanel.ts`、`src/views/recordPanel.ts`、`src/views/webview.ts`、`webview/main.ts`、`webview/content.ts`、`webview/styles.css`、`build-webview.mjs`、`tsconfig.webview.json`、`test/views.test.ts`、`test/render.mjs`；modify `src/extension.ts`、manifest／NLS／l10n、`tsconfig.json`、`tsconfig.test.json`、`package-lock.json` 与 package scripts。lockfile 只记录本扩展所需依赖。

**Interfaces:** `ProblemPanel.open(document: ProblemDocument, sourceUri: string): Promise<void>`；`RecordPanel.open(ref: RecordRef): Promise<void>`。Webview 消息仅 `submit`、`importCph`、`viewRecord`、`openOriginal`、`selectLocale`、`continueQuery`、`stopTracking`，消息不携带用户可伪造的源码路径、任意命令或提交正文，控制器使用自身绑定上下文。

- [ ] **Step 1:** RED：两站相同数据 shape 进入同一模板；Ctrl+Alt+P→`becoder.ojConnect.showProblem`，Ctrl+Alt+S 仍为 `becoder.ojConnect.submit`，when 均为 C／C++ 的 editorTextFocus，保留其他上下文原键位。
- [ ] **Step 2:** 建立本扩展自己的静态构建：markdown-it14.3.3、DOMPurify3.4.17、KaTeX0.18.10、esbuild0.28.2、jsdom26.1.0、类型依赖 @types/markdown-it14.1.2，均为当前仓库已解析版本。依赖写入本扩展 manifest／lock；typecheck 对 host、site-scripts 和 Webview 三套配置都执行 noEmit，浏览器配置含 DOM 库、不引入 vscode 运行时；测试配置覆盖新增纯代码。Markdown 和 HTML 统一净化后挂载，KaTeX `trust:false`；不引入 React 或洛谷整个 Webview 构建树。
- [ ] **Step 3:** 用共同布局与 VS Code 主题变量实现题面／记录页，分别拥有来源文档和 record 引用；结果未知、读取中断及缺失字段可读。共同按钮绑定已有控制器；语言偏好分站记忆；记录页可关闭并重新只读打开，不失去正式 ID。
- [ ] **Step 4:** RED→GREEN 渲染测试：公式／图片、英日与中文、多章节、长标题、空样例；脚本、onerror、javascript／command URL 不能执行或触发宿主；`assert.equal(document.querySelectorAll('script[data-remote]').length, 0)`。资源相对原题解析，外链由明确动作打开，Webview CSP 禁止任意 connect。
- [ ] **Step 5:** `npm --prefix extensions/becoder.oj-connect run test-render` 跑实际渲染，并采集两站共用布局的窄／宽窗口、深／浅色截图；检查按钮、焦点、滚动、复制样例和状态反馈。构建不等于视觉验收，负责人最终确认统一效果。

## Task 7: 浏览器 Import 与明确源码的 CPH 样例关联

**Files:** Create OJ 扩展 `src/importController.ts`、`src/sourceStore.ts`、`src/cphHost.ts`、`test/importController.test.ts`、`test/sourceStore.test.ts`；modify `browserProblemFeature.ts`、OJ `extension.ts`、CPH `src/extension.ts`、`src/problemStore.ts`、`src/importController.ts`、`src/problem.ts` 及 `test/problemStore.test.ts`、`test/importController.test.ts`。

**Interfaces:** `_becoder.ojConnect.importFromBrowser(problem: ProblemDocument): Promise<{sourceUri:string} | undefined>`；`SourceStore.openOrCreate(root: string, directory: string, fileName: string, signal: AbortSignal): Promise<{sourcePath:string; created:boolean}>`；新增 `_becoder.cph.importSamplesForSource({sourceUri:string, problem:CphSampleProblem})`，返回现有 `ImportResult`。`CphSampleProblem` 在 CPH `problem.ts` 定义，仅含 name/group/url、原始样例、interactive、可得 timeLimitMs/memoryLimitMiB；不用编造限制通过旧严格 parser。

- [ ] **Step 1:** RED：浏览器导入洛谷 P1001→`root/luogu/P1001.cpp`，打开源和共同题面；CPH 调用数为0。重复 Import 保留磁盘与未保存稿。选根取消、工作区变化、失配题目均不创建文件。
- [ ] **Step 2:** 实现导入路由：双站交给 OJ Connect 读取完整题面；其他现有 CPH 支持站点继续原直接导入路径，保护既有功能。浏览器到扩展传输经校验的共同对象，不接收网页 saveLocation；扩展未启用则提示，不能偷偷退回另一种双站导入体验。
- [ ] **Step 3:** RED→GREEN 路径与竞态：配置目录合法性、canonical 父路径、junction／symlink／hardlink、文件独占创建、目标在屏障间出现、根被换掉。`assert.equal(existingContents, before)`；失败不补偿删除用户文件，不递归清理项目。
- [ ] **Step 4:** 为 CPH 加入精确 source 接口，在源码直接父目录管理 `.cph`，只写该源码的 metadata，保留 lease、版本检查、样例替换确认与忙／未保存样例检查。相同 URL 关联其他源码不自动改绑，也不创建第二份解答。缺限制保留“未提供”，本地执行采用明确显示的 CPH 默认限制，不向题面或线上结果伪造限制。
- [ ] **Step 5:** GREEN：原 CPH 本地题目、其他站点直接导入及 existing metadata 兼容；新入口只在用户点击时调用，现有源码不经 CPH 模板初始化／占位符清理。源码与样例字节检查、明确取消和重复导入测试通过。

## Task 8: 五站登录摘要与外围能力移除边界

**Files:** Create OJ `src/views/loginView.ts`、`test/loginView.test.ts`；modify manifest／NLS、`src/extension.ts`、`test/keybinding.test.ts`、`UPSTREAM.md`、`ThirdPartyNotices.txt` 和 extension README。

**Interfaces:** TreeDataProvider view ID `becoder.ojConnect.accounts`，固定五站行；`becoder.ojConnect.refreshAccounts` 只读取摘要，登录／退出操作由官网承接。未接入三站显示不可用，不能调用伪造的空适配器。

- [ ] **Step 1:** RED：五站顺序和标签可读；Luogu signed-in、AtCoder unknown 及其余 unavailable 各不混淆；刷新失败保留 unknown，不清除宿主 Cookie。无题库／历史／文章子树。
- [ ] **Step 2:** 实现按需刷新与交互结束后更新；展开侧栏不会启动持续网络轮询，不持久化账号凭据。
- [ ] **Step 3:** manifest 边界测试确认仅共同入口与必要诊断动作；无 luogu.* 老快捷键、比赛 monitor、打卡、社交、专栏或 CPH 本地端口服务。仅迁移需要的上游组件，逐项登记版权与依赖。
- [ ] **Step 4:** 扩展 typecheck/test、英中文案键一致性和渲染检查 GREEN；确认侧栏没有演变成题库导航中心。

## Task 9: 全链路、分发与负责人验收

**Files:** Modify `scripts/test-atcoder-shortcut.cjs`、`build/lib/test/oiExtensionBoundary.test.ts`、`build/azure-pipelines/win32/verify-becoder-package.ps1`、`resources/oi-defaults/BUNDLED-COMPONENTS.json`、OJ 构建脚本／来源文档；create `scripts/test-oj-connect.cjs`。根 `compile-oi-extensions` 已包含 OJ 扩展，只按新增资源需要调整，不重复加入口。

**Interfaces:** 合成 Electron 使用实际编译控制器→适配器→受限桥→主服务，在私有 intercepted session 中统计实际发送；不读取用户 Cookie。新脚本为主链入口，保留旧 AtCoder 原生边界用例，统一记录 JSON 结果与运行版本。

- [ ] **Step 1:** 组合回归：两站确认新 ID、共同页面更新；直接 ID 回执和候选核对分别工作；取消后晚到验证0POST，手动 Submit不补发，记录断网再查总POST=1；页面关／导航／扩展结束取消到实际执行方。初次组合若已通过不制造虚假 RED。
- [ ] **Step 2:** 更新包资源检查：`out/extension.js`、`dist/site-scripts.js`、Webview JS／CSS、KaTeX 字体、NLS、全部实际依赖许可。UI 与 host 不能从源码目录或邻接扩展 node_modules 临时取资源；源文件与发布资源均有来源记录。
- [ ] **Step 3:** 最终只读审查覆盖需求完整性、契约、两窗口隔离、源码与样例保护、权限边界、原 AtCoder／CPH 行为和实际证据；修复具体问题后按影响重跑。保留现有受保护扩展策略及 OI 边界检查，不为绕过失败降低保护。一个最终独立审查，不逐任务重复开审查代理。
- [ ] **Step 4:** 完成正式矩阵并构建 staged、直接包验证。需替换运行中测试版前取得保存／关闭确认；保留日常安装、独立 Portable 数据和用户文件，不强杀窗口。
- [ ] **Step 5:** 负责人使用新测试版，分别以明确练习题和解答完成两站 Import→共同题面→显式 CPH→本地测试→Ctrl+Alt+S→共同本次评测页。另用已有源码 Ctrl+Alt+P 验证相同路径。记录构建、题目、新ID、实际判定与可得源码核对，不把旧 AC 当作本轮。
- [ ] **Step 6:** 更新产品／架构／本计划状态，分别列明已完成与仍受真实网站阻塞的部分；后者不能勾为完成。不继续 CF／牛客／蓝桥，不自动提交／推送或构建 Setup。

## 正式验证预检与命令

本轮只编制文档；下列产品命令在执行期按 owning task 创建入口并预检后才运行，不是当前通过声明。每条在忽略目录台账记录精确 argv、输入、退出码、耗时、失败层与受影响后续检查。删除文件与当前普通文件分开枚举，严格沿用[验证协议](../../.agents/skills/develop-becoder/references/validation-protocol.md)。

1. 扩展 `typecheck`、`build`、`test` 沿用现有脚本；build 增加静态 site scripts／Webview，新增 `test-render` 使用 root 已有 `@playwright/test`1.61.1，执行 `node test/render.mjs`。不新增浏览器测试运行时；先检查当前可用 Chromium。
2. CPH：`npm --prefix extensions/becoder.cph run vscode:prepublish`；`node node_modules/typescript/bin/tsc6 -p extensions/becoder.cph/tsconfig.test.json`；`node --test extensions/becoder.cph/out-test/test/problem.test.js extensions/becoder.cph/out-test/test/problemStore.test.js extensions/becoder.cph/out-test/test/importController.test.js extensions/becoder.cph/out-test/test/extension.test.js extensions/becoder.cph/out-test/test/parser.test.js`，工作目录均为仓库根。
3. 核心沿用[第一阶段聚焦 tsc／Mocha 命令](atcoder-extension-plan.md)，加入 `luoguBridge.test.ts` 与新增 AtCoder transaction 测试；先核对测试的真实编译 rootDir 与输出，记录冻结后的完整命令，不猜生成路径。Electron UI 测试前先 owning typecheck/transpile，再用既有 `scripts/test.bat --runGlob '**/browserOjConnectFeature.test.js'`；composition 用相同版本已验证 Electron 执行 `scripts/test-oj-connect.cjs`。
4. `node --test build/lib/test/oiExtensionBoundary.test.ts`；对实际变更普通文件运行相关 eslint/stylelint；`npm run valid-layers-check`。新增 Webview CSS 要加入 owning style 检查与实际渲染检查，不能只跑 TypeScript。
5. 最终顺序 `npm run typecheck-client`（120秒）→`npm run compile-oi-extensions`（120秒）→相关 lint／layers与受影响回归→`npm run gulp vscode-win32-x64-min`（300秒）→PowerShell7执行 `& .\build\azure-pipelines\win32\verify-becoder-package.ps1 -PackagePath ..\VSCode-win32-x64 -IncludeCompiler $true`。
6. 任一必需检查非零或外部超时是失败尝试，诊断并重跑失效检查后再构建。合成与渲染全部通过才进入 staged；staged／包成功后才交新构建负责人验收。无 Setup、Git 或系统环境变更。

## 计划自审与交接

覆盖映射：范围裁剪→Tasks5/8，三个共同对象与适配器→Task2，共同提交／记录状态→Task3，已验收 AtCoder保护→Task4，真实洛谷协议与登录→Tasks1/5，共同页面→Task6，目录／源码／CPH→Task7，登录侧栏→Task8，来源／构建／真实统一效果→Task9。五项 Review Focus 各已落实到所属任务。

契约核对：共同 `OjAdapter`、`SubmissionSession`、`SubmissionOutcome` 与 `RecordController.track` 名称全程一致；页面句柄和站点脚本仅用于站点宿主路径。Task1真实契约门禁与Task5实现门禁明确，未验证字段不藏在通用类型里。CPH入口需新增可选限制模型，不能伪造时间／内存通过现有严格 Companion parser。发送 session 释放与待确认尝试的只读核对分开，避免界面显示“继续查询”却已丢失上下文。

本计划体现整体设计批准，不把计划编制当作实施授权。待负责人审阅后，沿用本会话直接执行与最终一次独立审查；执行时保留当前 dirty 基线，不自动提交、推送或开启后续站点开发。

## 2026-11-13 执行补充

负责人最新要求：充分接纳洛谷插件，普通站点行为先沿用上游；只为误交、重复受理、丢失正式回执或用户源码风险增加必要处理。洛谷 submitCode 的字段、rid 回执与验证码续交流程作为基准；fetchResult 的同 ID content-only 请求和 data/currentData 选择已迁入，原 MIT 声明保留。浏览器会话及共同 UI 的接线属于宿主适配，不改变站点操作语义。

共同流程与双站源码已实现，43项扩展测试和独立审查修正验证已执行；最终源码、构建／包和负责人真实验收分别记录于产品入口及审计台账。当前不把协议窗口 R309516436 或旧 AtCoder 记录当作新构建整体验收。
