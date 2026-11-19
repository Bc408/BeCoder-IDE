# OJ Connect 题面性能诊断实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. 2026-11-19 负责人已确认实施，按推荐 Native 方式执行，结束时安排独立只读审查。

**Goal:** 取得 AtCoder／CF 从当前看题命令到真实正文确认的可解释分段基线，形成有证据的逐站优化决定。

**Architecture:** 在当前读题和共同 Webview 中加入临时、有开关的诊断上下文，正常业务返回和权限检查保持。通过同一 flow／文档 revision 关联五段本地 span，以扩展端同一单调时钟计算总量；真实产品实例负责测量，合成用例只验证诊断准确性。诊断完成后本计划停止在优化决定，具体取文改造按批准设计的修订流程另行落盘。

**Tech Stack:** 现有 TypeScript、Electron、React、Playwright、esbuild 和仓库 Node／Electron 测试入口；不新增依赖。

**Spec:** [题面首屏性能设计](../specs/2026-11-19-oj-connect-statement-performance-design.md)。负责人已确认书面设计与本实施计划。

## Global Constraints

- 基线 OJ_connect / 4e8864641e73d6c955fae2be6b7db4fff8096b5c，加当前第一、二阶段未提交修改；不回退、提交、暂存或覆盖这些工作。
- 主指标为“看题命令 handler 到首段正文确认”；不含 handler 前按键派发和扩展激活，rAF 仅近似绘制边界，真实画面另确认。
- 五段为页面准备与就绪、取文与解析、面板交付、正文转换、正文装入。不同进程不直接相减时钟；重叠 span 不强求相加，总量以发起端起止为准。
- 新增日志只含 site／临时 flow／固定 phase／duration／有限分支及受限错误类别；无 URL、题号、文件路径、账号、Cookie、令牌、HTML、正文或源码。
- 仅测未登录的公开题；不登录、不提交、不导出个人数据、不导入用户样例。验证阻挡和失败单列，不自动改用备用传输。
- 不改提交／认证／回执／评测协议，不增加持久缓存、队列、预热、用户设置或遥测服务。
- 诊断只在本地候选启用；现有 stage 和个人数据、缓存保持。正常交付前移除临时代码和专用消息，并对最终源码重跑检查。
- 当前计划只包括诊断、验证、有限采样与报告；具体取文优化、正式 stage、Setup、Git commit／push、发布不自动执行。

## Review Focus

1. 同题重开使用已 ready 的 Webview：必须取得本次文档确认，不能借用旧 ready；Task 2 覆盖。
2. 切语言、重开、关闭后出现迟到回报：不能替新 flow 结束计时或改业务状态；Task 1、2 覆盖。
3. 未登录出现挑战、重定向或解析失败：失败不计作快速成功，也不触发登录或提交；Task 1、3 覆盖。
4. 诊断分支本身增加请求或阻塞正文：不得额外读官网、串行等待日志写入或等待完整高亮；Task 2、3 覆盖。
5. 不同进程时钟和嵌套 span：只接受各自 duration，总量与样本分类正确；Task 1、3 覆盖。

## Task 1: 固定诊断上下文和扩展端计时

**Files:** 创建临时 `extensions/becoder.oj-connect/src/statementDiagnostics.ts`、`test/statementDiagnostics.test.ts`；修改 `src/extension.ts`、`src/browserHost.ts`、`src/adapters/adapter.ts`、`src/adapters/{atcoder,codeforces}/adapter.ts` 及 `src/typings/becoder-oj-connect.d.ts`。新增文件先核对同区两份现有文件规范。

**Interfaces:** 在内部 d.ts 声明临时类型 `StatementDiagnosticContext = { readonly flowId: string }`、`StatementDiagnosticSpan = { readonly phase: StatementDiagnosticPhase; readonly elapsedMs: number; readonly branch?: StatementDiagnosticBranch }`，helper 消费这些类型。phase 固定枚举为 `prepare`、`document-ready`、`extract`、`atcoder-headers`、`atcoder-body`、`atcoder-parse`、`cf-companion`、`cf-recipe`、`cleanup`、`panel`、`webview-ready`、`render-load`、`render-parse`、`render-reply`、`body-mount`、`total`；branch 仅为 `created-hidden`、`reused-hidden`、`reused-visible`、`new-panel`、`existing-panel`、`cold-renderer`、`cached-renderer`。只读 adapter 的 `readProblem(problem, signal, diagnostics?)` 和 host 的 `readProblem(problem, diagnostics?)` 可传临时上下文，其他业务接口不变。`StatementDiagnostics.start(site)` 仅接受 atcoder／codeforces，返回本次 `{ context, span(phase, elapsedMs, branch?), finish(outcome) }`；outcome 为 `body-ready`、`failed`、`cancelled`、`replaced` 或 `closed`。内部依赖注入 `now: () => number` 和只接收白名单结构的 `write`，不接受任意日志正文。

- [ ] 先写失败测试 `diagnostics are off by default`、`one local clock owns total`、`invalid or extra log fields are rejected`、`closed and replaced flows cannot finish twice`。断言默认无日志／无额外命令；合法 UUID、有限非负 duration；传入 URL／源码／额外字段被拒绝；结束最多一次。
- [ ] 运行扩展 `npm run typecheck` 后 `npm test`，观察新测试因缺少实现失败；记录实际输出，不把模块路径或编排错误当预期失败。
- [ ] 实现最小临时 helper，使用 `performance.now()`；仅诊断子进程环境 `BECODER_OJ_STATEMENT_DIAGNOSTICS=1` 时创建 flow。环境仅由运行脚本传给本次子进程，不写用户／系统环境。phase 和错误类别用固定集合，原始异常不输出到新增日志。
- [ ] 看题 handler 记录 prepare／总量起点，将 flow 传入 AtCoder／CF 的固定 readProblem；返回文档仍走原校验，不附加到源码、偏好、CPH 或提交状态。错误只结束诊断，原业务错误照常处理。
- [ ] 重跑扩展类型与完整测试；确认未启用诊断时命令次数、站点请求和业务 DTO 与基线相同。保留成功、失败和取消回归，不作 Git 操作。

## Task 2: 两站取文与本次正文的局部确认

**Files:** 临时修改 `src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts`、`src/vs/platform/browserView/common/browserView.ts`、`src/vs/platform/browserView/electron-main/browserViewMainService.ts`；`extensions/becoder.oj-connect/` 下的 `site-scripts/{atcoder,codeforcesProblem}.ts`、`src/views/{model,webview,problemPanel}.ts`、`src/markdownService.ts`、`webview/luogu/problem.tsx`、`test/{views,siteScripts}.test.ts` 与 `test/render.mts`；以及 `src/vs/workbench/contrib/browserView/test/electron-browser/browserOjConnectFeature.test.ts`。

**Interfaces:** 固定 readProblem 命令及 `readOjProblem`／`waitForOjProblemDocument` 增加可选 `StatementDiagnosticContext`，命令接收方检查 UUID 与参数形状，权限仍来自窗口、Session 和官方题目校验。原始 `ProblemDocument` 不变；临时诊断返回类型为 `StatementDiagnosticDocument = ProblemDocument & { readonly diagnosticSpans?: readonly StatementDiagnosticSpan[] }`，由 host 消费 span 后执行原文档校验，诊断字段不进入业务文档。固定站点脚本的第三个可选诊断参数只返回本地 duration；不执行远程代码。临时 `PanelState.statementDiagnostic = { flowId, revision }`，revision 为面板内随文档替换递增的正安全整数；专用回报只允许 `{ action: 'statementDiagnostic'; flowId; revision; phase: 'document-received' | 'body-ready'; elapsedMs }`，duration 有限、非负且不超过 120000ms，禁止任意 phase、附加正文或旧 revision。

- [ ] 先写失败回归：主进程 span 不含页面材料；AtCoder 分开 headers/body/parse、CF 分开 CPH/recipe；finally cleanup 即使出错也可记录；错误和权限判断不变。
- [ ] 先写失败面板／Chromium回归：新面板 ready 和本次文档确认分开；已有面板不等第二次 ready；只有当前语言、当前 revision、首个非空且可见正文的 rAF 可完成总量；旧语言／关闭／重开回报无效；无正文或失败不能完成成功总量。
- [ ] 用当前拥有者类型检查和聚焦测试观察上述失败，随后只增加临时时间点与受限回报。前端首次正文仍先挂载文本，不等待高亮；日志记录不能增加官网 GET、账号刷新、提交准备、轮询或延迟正文显示。
- [ ] `renderContent` 诊断关联必须绑定宿主当前 flow／revision 和该正文 section；转换开始时保存该关联，回包前检查其仍有效。分别记录 renderer 首次加载、parse 与回包，不把整段当纯 CPU 时间。
- [ ] 新文档接收时确认本次 revision；正文 rAF 回报结束扩展端 total。页面取消或生命周期失效只终结对应诊断，不创建新的业务取消／恢复策略。
- [ ] 跑完整扩展测试及 `test-render`；保留一、二阶段导航、fragment、同源码 CPH、语言偏好与英文评测回归。再执行本计划下表的 core 类型／workbench 测试，不启动真实采样直至全部必要检查通过。

## Task 3: 隔离产品采样、报告和优化决定

**Files:** 诊断执行时才创建忽略目录 `tmp/oj-connect-audit/statement-performance-20261119/` 下的 `run.mts`、命令清单、台账、有限数据和截图；新增受跟踪结果文档 `docs/oj-connect/statement-performance-2026-11-19.md`，并更新入口。不把诊断 runner 加入扩展或发布清单。

**Interfaces:** runner 只消费现有 Playwright `_electron` 与本地开发 Electron；参照 `test/automation/src/{electron,playwrightElectron}.ts` 的开发启动配置，独立 `--user-data-dir`、`--extensions-dir`、`--logsPath`，仅注入本次环境开关。收集器只接受 `[OJ Connect statement perf]` 后的已校验结构，按 flow 关联，输出成功原始样本和独立失败表；实际页面截图用于正文确认，不嵌入新增诊断日志。

- [ ] 先测试样本汇总：缺少总量不算成功；三组分类不能相互混算；中位数和最大值取实际成功样本；失败阶段保留；不同进程 duration 不直接相减。先观察失败，再实现 runner 的汇总部分，不先运行官网。
- [ ] 预检当前开发 Electron 的产品文件名及实际路径、Playwright 缓存和启动输入。编写计划时 `.build/electron/BeCoder.exe` 不存在，根依赖 Electron、Playwright 和已验证下载缓存存在；执行时先复核。需准备开发运行时则仅以子进程环境 BECODER_ELECTRON_ARCHIVE 指向已有固定缓存运行根 `npm run electron`，沿 build/lib/electron.ts 的普通文件、版本与 SHA256 验证。该命令会重建 `.build/electron`，执行前必须确认目标无现有运行实例／自定义资产；无法证明时停止，不改用下载或覆盖旧 stage。运行 `npm run transpile-client`、扩展生产 bundle 和必要 OI 编译，保证开发实例包含一、二阶段与临时诊断；不使用旧 stage 替代。
- [ ] 启动本地开发 Electron 的真实产品入口，使用既有自动化启动方式和隔离目录；不改变通用 smoke driver 或关闭普通产品权限检查。关闭测试实例只作用于其本次进程句柄，不按进程名结束日常应用。
- [ ] 在本次隔离测试工作区创建只用于看题的合成 `.cpp`：AtCoder 使用 `abc086_a`、`abc081_a`；CF 使用 `4_a`、`71_a`。这些 ID 是候选样本，读取前按现有 resolver 验证规范官网路由；结构或验证不支持则记失败，不静默替换成另一路径。
- [ ] 每站进行 3 次独立进程轮次。每轮依次测首次题 A、同进程另一题 B、再次看题 B，得到每站三组各 3 个尝试；每次等待成功或当前请求的有界失败后再发下次动作。采样串行、零源码 POST；有验证阻挡时停止该轮后续同站采样并报告，不扩大到账号操作。
- [ ] 每次记录首次进程／后续新题／同题重开及 created/reused、hidden/visible、已有 panel 标签；截取正文确已出现的真实产品画面。不清任何缓存；不得称进程首次为网络冷缓存。启动、自动聚焦与按键派发在 handler 指标外另说明。
- [ ] 汇总两站五段跨度、总量、未分解交接、原始样本、中位数、最慢值和失败类别。将已有合成测试另列，不能填补真实失败样本；本地 renderer 或目录探针不充当产品首屏。
- [ ] 独立只读复核诊断准确性、零额外站点请求、所有权与数据字段，根代理另作最终复核；修复具体问题并重跑受影响检查／样本。
- [ ] 给出逐站决定：AtCoder 第二次取文占比是否足以支持单文档路线，CF 主因是导航还是解析，本地阶段是否值得优化。如果支持改取文，先修订设计的具体固定路由、同 Session 传输、原文解析与失败行为，再更新实施计划；本计划不直接执行未定接口改造。
- [ ] 在报告中列明临时变更及移除清单。当前候选继续隔离用于后续对照，明确不可分发；优化阶段按清单移除诊断后重新验证最终源码，不清本地证据或原缓存。无收益时报告已知瓶颈和限制，不把“完成诊断”描述为“性能已优化”。

## 验证命令与预检规则

正式执行前，把下表、实际输入、cwd、子进程环境、timeout 和失败停止条件冻结到本计划审计目录；确认所有执行文件和模块存在。新增本地 runner 的语法先检查，再用于启动目标。外部上限由 Node 子进程 runner 控制，标准检查不使用 npm run compile。

| 检查 | 命令／入口 | 外部上限和结果 |
| --- | --- | --- |
| 扩展类型 | 扩展目录 `npm run typecheck` | 120 秒，exit 0 |
| 扩展回归 | 扩展目录 `npm test` | 120 秒，完整扩展／内容回归通过 |
| 扩展生产 bundle | 扩展目录 `npm run build` | 120 秒，exit 0 |
| Webview 局部集成 | 扩展目录 `npm run test-render` | 120 秒，exit 0，临时首屏回报与原矩阵均通过 |
| 客户端类型 | 根 `npm run typecheck-client` | 120 秒，exit 0 |
| 开发运行时准备 | 仅在目标安全时，根 `npm run electron`，子进程使用已验证缓存 `C:/Users/Bc/AppData/Local/electron/Cache/6cde15465600197012306bbee8b28f241582519643669e7f8df7a283d23042ba/electron-v43.7.3-win32-x64.zip` | 120 秒，exit 0；由现有构建代码校验，不下载、不改现有 stage |
| 核心编译输出 | 根 `npm run transpile-client` | 120 秒，exit 0，供当前开发实例和 workbench 用例使用 |
| workbench 聚焦 | 当前本地 Electron `test/unit/electron/index.js --runGlob '**/browserOjConnectFeature.test.js'` | 60 秒，exit 0；启动 stdin 为 ignore，先核对真实 Electron 路径 |
| OI 扩展编译 | 根 `npm run compile-oi-extensions` | 120 秒，exit 0 |
| 静态检查 | 根 `node node_modules/eslint/bin/eslint.js --no-warn-ignored` 加现有普通改动源／测试文件；分层改动另跑 `npm run valid-layers-check` | 各 120 秒；输入排除删除项、目录、生成输出 |
| 文档／差异 | develop-becoder 文档结构脚本、本轮 Markdown 目标与 JSON 检查、`git diff --check` | 各 10 秒；新未跟踪文档另检查 |

任何必要检查非零或超时都记录原输出与失败层次，修复后先重跑最小受影响检查，再恢复后续序列。预期 TDD red 与意外失败分开；测量不能覆盖源码失败。真实网络失败不能解释为已验证的本地性能问题。

## 执行方式与停止点

建议 **Native**：由主代理按任务顺序实现，使用一次新上下文的最终只读审查。三个任务共享同一 flow／revision 与临时诊断接口，逐任务更换实现者会增加交接成本。若负责人希望逐任务独立实现及审核，可选择 Subagent-driven；两种方式都保持以上门槛与保护边界。

本计划已获实施确认；执行记录位于 `tmp/oj-connect-audit/statement-performance-20261119/`。保留当前脏工作区并已复制普通文件快照，不创建会遗漏第一、二阶段修改的新 checkout；Windows 使用等价本地台账。不会自动 commit／push。

## 2026-11-19 执行结果

- [x] Task 1：默认关闭的受限 flow／span、单一扩展时钟总量、字段白名单、最多一次结束及扩展传播完成；首次预期 red 和修复后的完整回归保留。
- [x] Task 2：页面准备、站点解析、finally、当前面板文档／section、正文 rAF 和失效保护完成。独立审查修正失败分段丢失、枚举／visible／大小边界及主进程测试加载兼容性，最终拥有者检查通过。
- [x] Task 3：真实产品三轮／站采样完成，正式 16 次尝试、15 次正文确认、1 次 AtCoder 固定脚本派发前失败；该轮后续两槽未执行。详细原始值、失败、界限及逐站决定见[最终诊断报告](../../oj-connect/statement-performance-2026-11-19.md)。

执行期发现并公开纠正了运行时隔离预检错误：产品重命名的 BeCoder.exe 以 app.isPackaged=true 强制使用安装数据根，CLI user-data-dir 被覆盖。原六轮与两次单次确认全部排除；首次修正又主动创建 Session 的探针也排除。没有清理或恢复既有数据。

正式采样改用已存在、同为 43.7.3 的标准 `node_modules/electron/dist/electron.exe`，运行同一仓库 `out/main.js` 真产品入口；不修改 app.isPackaged 或生产数据根。显式本轮 portable／shared／extensions／logs，在任何站点动作前核对实际路径，观察产品正常创建的 Session 而不预建。该执行适配只修正本地 runner，不扩大生产实现范围。

最终类型、扩展 140 项及内容回归、Chromium 渲染、client／transpile／OI、workbench 56 项、Electron main 7 项、原 renderer suite、lint／分层均通过；最终文档检查按报告落盘后执行。当前保留临时诊断候选作后续对照，不分发、不构建正式 stage、Setup 或执行 Git 变更。原分步 checklist 保留为实施前步骤描述，本节是实际执行状态和偏差的权威记录。
