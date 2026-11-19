# Codeforces practice implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 接入普通公开 CF 比赛的赛后练习，复用现有题面、CPH 和评测体验，交付无旧用户数据的 stage。

**Architecture:** 扩展拥有题目身份、源码快照和共同页面；原生 Session client 拥有官方表单、单次发送及正式记录核对；固定 bridge 和 workbench 命令限定窗口、会话和任务所有权。提交不运行题面或提交页，获取题面复用 CPH 的浏览器解析结果和共同内容管线。

**Tech Stack:** TypeScript、Electron Session / net.request、已有 Acorn、CPH Companion、React 共同 Webview。

**Spec:** [已确认设计](../specs/2026-11-18-codeforces-practice-design.md)。2026-11-18 负责人已确认进入实施。

## Global constraints

- 仅 `codeforces.com` 普通公开比赛赛后练习；拒绝 Gym、进行中、虚拟、group、团队／私有和镜像入口，不静默转换。
- 身份 `4/A`，文件 `codeforces/4_a.cpp`；真实官方题号后缀保留，目录优先，通用下划线文件名不跨站抢占。
- 编译器来自当次官方表单；按 CF 和 C/C++ 分开保存偏好。
- 单次 POST，`net.request` 显式 Session、`useSessionCookies: true`、`redirect: 'manual'`；受理不明只查询、不重交。
- 无预热、隐藏提交页、页面池、队列、API 密钥或新认证／新依赖；保留原三站协议。
- 不改主页、主题、微信、下载、Beacon；本轮不自动 commit、push、Setup。
- 测试使用隔离实例／profile，不操作用户日常窗口；最终 stage 不含研究或旧用户数据。

## Review focus

1. 空本人记录列表必须可区分真实空列表和挑战／解析失败，不要求已有历史提交。
2. 同题并发、分页溢出、同源码多候选不能按最新一条误认；核对账号、题目、编译器和源码。
3. Cookie 轮换不等于退出；账号、窗口或 scope 变化后，晚到准备和结果不得发出源码或污染新任务。
4. HTML 诊断、字符串布尔和未知评测状态不得产生脚本、假终态、假测试点或假分数。
5. 获取题目→传送至 CPH 使用同一文件；脏源码和用户样例不能被覆盖。

## Task 1: CF 协议与原生单次请求

**Files:** `src/vs/platform/browserView/electron-main/codeforcesProtocol.ts`、`codeforcesSessionClient.ts`、`codeforcesTransport.ts` 及对应 `test/electron-main/*.test.ts`。

**Interfaces:** `CodeforcesSessionClient` 消费固定 `fetch`、单次 `post`、会话同步和变化事件；提供 `login(signal)`、`prepare(problem, signal)`、`submit(problem, payload, ownerKey, requestId, signal)`、`readRecord(record, signal)`、`reconcile(attemptId, signal)`、`releaseRecord(record)`、`invalidate()` 和 `dispose()`。`prepare` 返回 `{ ownerKey, languages, hasDraft: false }`。协议解析仅使用字面量 AST，不执行远程脚本。

- [x] 先写并观察失败测试：动态语言／令牌、明确普通练习资格、真实空列表、账号不符、HTML／字符串布尔、未知状态、源码 CRLF 核对、多候选、重定向 302／307／308、取消和一次发送。
- [x] 从已保存真实材料及必要官网只读材料实现解析；不足的结构保守失败，不猜测。
- [x] 表单和本人列表并行准备，发送前核对当前 Session；POST 一次后用原边界确认唯一新记录与精确源码。
- [x] 记录核对时复用初始结果；不明受理保留有界临时尝试，显式 reconcile 只读。
- [x] 运行聚焦协议、传输和 Session 测试，保存失败与通过证据。

## Task 2: 固定 bridge 与主进程所有权

**Files:** `src/vs/platform/browserView/common/codeforcesBridge.ts`、`browserView.ts`、`electron-main/browserViewMainService.ts`、`src/typings/becoder-oj-connect.d.ts` 及共同 bridge 测试。

**Interfaces:** `ICodeforcesPrepared` / `ICodeforcesSourcePayload` 与已有 Nowcoder 对应 DTO 具有同样字段但保留 CF 所有权；`CodeforcesBridgeController` 提供 prepare/send/cancel/release/readRecord/reconcile。服务提供 `openCodeforcesSession`、`prepareCodeforcesTask`、`submitCodeforcesTask`、`cancelCodeforcesTask`、`readCodeforcesRecord`、`releaseCodeforcesRecord`、`reconcileCodeforcesAttempt`。

- [x] 先写并观察失败测试：受限来源、单次句柄、取消晚到、伪造记录、窗口／Session 不匹配及销毁。
- [x] 在当前持久 Session 创建 client，固定 IPC 方法，不暴露任意请求或脚本；扩展会话事件枚举，普通 Cookie 轮换不失效。
- [x] CF 主动题面读取验证当前官方题目页后复用 `parseProblem` 的 CPH 结果，并调用固定 `readCodeforcesProblem` DOM 内容脚本；此路径与提交独立。
- [x] 运行 bridge 聚焦测试和 owning 类型检查。

## Task 3: 扩展、题面与既有流程接入

**Files:** `extensions/becoder.oj-connect/src/adapters/codeforces/{task,adapter}.ts`、`browserHost.ts`、`domain.ts`、`extension.ts`、`browserProblem.ts`、`problemResolver.ts`、`preferences.ts`、`views/loginModel.ts`、`site-scripts/`、manifest／中英文文案及对应测试。

**Interfaces:** `codeforcesProblem(input)` 返回规范 ProblemRef；`CodeforcesAdapter` 实现既有 OjAdapter；`CommandCodeforcesHost` 只调用 `_becoder.ojConnect.codeforces.*`；`readCodeforcesProblem({ problem, companion })` 消费当前 DOM 与 CPH 已解析样例／限制，不重复实现样例解析器。

- [x] 先写并观察失败测试：URL／文件名可逆、目录优先与跨站歧义、动态偏好、可信个人页、DTO／站点隔离、取消以及同源码 CPH。
- [x] 装配 CF adapter、固定 transport、sidebar、偏好和浏览器识别；不修改 CPH 不支持站点的默认行为。
- [x] DOM 题面只组织正文／输入／输出／说明；使用共同安全渲染、公式、复制和布局。
- [x] 跑扩展 typecheck、测试与生产 bundle；补齐真实采用来源的 notices，不新增无必要依赖。

## Task 4: workbench 装配与评测显示

**Files:** `src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts`、`extensions/becoder.oj-connect/webview/luogu/record.tsx` 及 owning 测试／render 脚本。

- [x] 先补失败用例：CF 固定命令注册、scope 校验、静态 sidebar 状态、未知回执仅查询、无用户／分数占位、真实进度和 CE 不伪造测试点。
- [x] 装配 bridge／Session map、显式登录和 record 释放，复用共同 120 秒追踪；提交与查询不展开浏览器。
- [x] 复用共同状态色、蓝色等待动画和卡片，仅补 CF 必要状态别名／进度信息。
- [x] 完成深浅／窄宽截图检查并按实际效果微调。

## Task 5: 综合审查、隔离实测与 stage

- [x] 逐任务审查需求、逻辑、竞态、去冗余和原三站回归；再作完整只读复核，修复具体发现并重跑受影响检查。
- [ ] 隔离产品实测：获取题目→同源码 CPH→未保存源码提交→正式 ID／精确源码核对→评测；记录准备／发送／确认／首绘时间，不把探针证据当成产品验收。
- [x] 预检并冻结最终命令：扩展 typecheck／test／build／test-render；拥有者 core 测试；相关 lint／layers／文档／diff；`npm run typecheck-client`（120 秒）、`npm run compile-oi-extensions`（120 秒）、`npm run gulp vscode-win32-x64-min`（300 秒）。具体执行入口和输入在验证台账中核实后记录。
- [ ] 关闭或确认 stage 未占用，构建干净 stage；不带旧 `data`、研究会话、测试源码或日志。构建成功后交付，负责人验收另行成立。

## Execution record

2026-11-18 实现及拥有者回归已完成。生产 CF client 与 native transport 在隔离的已登录 Session 实交一次，记录 `399054020` 为 Accepted，精确源码一致；准备 883 ms、发送入口至正式回执确认 2540 ms。真实题面经实际 CPH bundle 与固定 DOM reader 读取通过，扩展回归覆盖同文件复用、样例不变和未保存源码快照。完整桌面“获取题目→传送至 CPH→快捷键→首绘”的连续运行、快捷键总耗时及负责人验收仍未完成，上面的整链路条目保留未勾选，不以这些分层证据代替。

最终预检／命令／退出码位于本机 `tmp/oj-connect-audit/codeforces-final/{plan.json,ledger.jsonl}`，构建结果以台账实际退出码为准。最终复核补上官网 `locale` 参数的统一识别，并保持其他上下文参数拒绝；另核实中文语言包 91 个文件与 HEAD 逐字一致，仅修正组件清单中陈旧的源目录／打包目录派生哈希。没有新增依赖或改变该语言包内容。

开发记录与验证台账保存在本计划对应的隔离临时目录，记录每次命令、输入、退出码、失败类别和必需重跑；不存 Cookie、令牌和个人源码。用户已授权实施，不再以通用技能的计划确认或每任务提交步骤重复停顿；Git 另待明确指示。
