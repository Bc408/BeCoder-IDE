# OJ Connect 技术可行性审查

日期：2026-11-12。源码基线：`OJ_connect@6bdd83cd39943a1132730ba5e608cb17db3d37c5`。

本文保留调研与 MVP 证据，各节按其调查／构建时点阅读。当前产品要求、内置扩展方向和能力状态见 [OJ Connect 产品与开发入口](oj-connect/README.md)与[技术架构](oj-connect/architecture.md)；后续批准的用户主动提交功能不改变 Beacon 的只读材料边界。

状态：静态审查已形成候选结论；AtCoder 人工提交与单条正式详情读取 MVP 已实测通过，解码源码与本地文件一致；身份、CE、分页和其他边界尚待验证。本文不是四站正式功能完成或整体产品验收记录。

## 范围与结论

审查洛谷、Codeforces、AtCoder、牛客 ACM/练习题库、蓝桥云课日常题库。原正式要求中的洛谷、CF、AtCoder、蓝桥完整本人同题材料范围继续有效；牛客为新增候选。用户主动提交入口属于本次研究对象，不自动成为已批准产品功能。Beacon 不取得登录、提交、运行或改写学生源码能力。

技术结论为有条件可行。已有浏览器、题面解析、CPH、本地执行证据和会话材料可以复用；尚缺平台认证后的完整证据、窄范围 OJ 查询入口及准确的远程提交身份关联。没有证据支持直接移植某个插件就完成全部目标。

## 证据分级

| 等级 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| 文档 | 官方或作者声明的协议/能力 | 当前用户可调用 |
| 源码/VSIX | 存在请求、解析或界面实现 | 网站接受请求、账号权限充分 |
| 匿名请求 | 当时匿名返回的实际状态与字段 | 登录后链路可用 |
| 真实会话 | 指定账号、题目、环境下观测的结果 | 所有平台/赛事均成立 |
| 产品验收 | 指定构建覆盖的完整旅程 | 更晚源码或未覆盖条件成立 |

## 当前仓库接点

- [浏览器 session](../src/vs/platform/browserView/electron-main/browserSession.ts)：Global 使用持久 partition，Workspace 使用工作区存储路径，Ephemeral 使用独立临时 partition。网站会话作用域与 Beacon 工作区根不同，不能按 Beacon 根猜账号身份。
- [页面所有者](../src/vs/platform/browserView/electron-main/browserView.ts)：持有真正的 webContents/session。存在 `session.fetch` 的内部消费者，不代表已有可供扩展或模型任意请求的网站 API。新读取必须绑定调用窗口、页面和实际 session，并处理导航、销毁与取消。
- [题目导入](../src/vs/workbench/contrib/browserView/electron-browser/features/browserProblemFeature.ts)与 [CPH](../extensions/becoder.cph/src/extension.ts)：当前窗口内导入，无外部 HTTP 接收器。上游插件的 localhost:27121 提交/导题桥不能直接接用。
- [题目校验](../extensions/becoder.cph/src/problem.ts)：单题、非交互、标准输入输出；URL 查询参数仍参与身份。平台规范化不能擅自吞掉 contest/group 等上下文；需保留单位、样例空白、已有源码和草稿保护。
- [Beacon 上下文工具](../extensions/becoder.beacon/src/contextTools.ts)：运行 producer 仅有 runner/cph/notebook；记录引用 revision，会话消费后取得独立材料。远程 OJ 提交不能冒充本地 runtime 写入现有队列。
- [正式边界](beacon/oj-technical-design.md)：当前打开页读取与额外联网查询分开；后者依真实用户许可，不能由登录态或页面内容生成许可。不新增独立许可台账，不后台同步全账号。

## 平台可行性矩阵

| 平台 | 当前主要证据 | 推荐研究路线 | 关键缺口 |
| --- | --- | --- | --- |
| 洛谷 | MIT VSIX 4.18.2，标准扩展入口、独立认证、题面/提交/记录接口 | 参考业务代码，适配当前 CPH 和浏览器会话 | 登录、比赛权限、最新记录字段、CPH 协议差异 |
| CF | 官方 API 和多个客户端源码；匿名 user.status 返回 OK | 公共 API + 本人认证数据 + 浏览器网页 | 内嵌浏览器验证、认证源码、提交精确 ID、PRETESTS/重判 |
| AtCoder | 官方公告、客户端源码、当前 BeCoder 中人工登录提交后的正式 ID、源码和 AC 详情 | 网页读取与真实浏览器会话协作 | 自动化适配、完整语言目录、分页、CE、重启和会话隔离 |
| 牛客 | 官方 MIT VSIX 1.0.24、当前 ACM 官网 JS | 分别核实练习与 ACM 场景的内部接口 | sceneType/内部 questionId、扫码会话、团队比赛和结果权限 |
| 蓝桥 | 官网 JS 定义调用链；匿名列表 200，详情/记录 401 | 网站会话绑定的内部接口 | 免费题/会员权限、源码、语言映射、轮询结果 |

牛客和蓝桥均应称官网内部接口，不能称对第三方承诺稳定的开放 API。CF 的内嵌浏览器验证尚未完成；AtCoder 已证实当前环境中人工登录和提交可用，不能推广为自动化接口已实现或验证始终可通过。

### CF

[官方方法](https://codeforces.com/apiHelp/methods)提供题库元数据、比赛、个人提交；题面和样例仍需网页。`user.status` 的 `includeSources` 限本人认证请求；`contest.status` 的同名选项要求比赛管理员，不能混淆。[认证与限速](https://codeforces.com/apiHelp)需要请求签名、时钟和至少两秒间隔。

没有发现官方提交 API。网页提交必须保留当前账号、语言和比赛资格；浏览器接走代码、导航到列表或最新出现 AC 都不是本次提交的可靠证明。

### AtCoder

[官方公告](https://atcoder.jp/posts/1457)说明登录已有 CAPTCHA，提交/自测也将引入验证；赛中 Rated 豁免不作永久保证。不能从旧工具的密码登录代码推定现行支持。

[AtCoder-Helper](https://github.com/Transparent-fish/AtCoder-Helper/tree/ac999131c70a7ed57c43ec0ec38fef702996a1e7)实现题面、动态语言目录和部分提交详情解析，但依赖手工 Cookie，遇验证码仅退回浏览器。历史只读首屏、按同题状态判断结果存在误关联，网络日志包含凭据片段的做法不可照搬。[旧 AtCoder Extension](https://github.com/taizod1024/vscode-ac-ts-extension)作者已声明验证码导致不可用。

[AtCoder Problems](https://github.com/kenkoooo/AtCoderProblems/blob/main/doc/api.md)是第三方目录/历史摘要，不提供登录、提交和完整源码详情。[网站 contest.js](https://img.atcoder.jp/public/d43c13d/js/contest.js)存在按明确提交 ID 轮询状态的逻辑；认证后 JSON 尚待实测。

### 牛客

官方包 `nowcoder.nowcoder-1.0.24.vsix` 的 README、[官方发布帖](https://www.nowcoder.com/discuss/575265839176302592)和完整 MIT 声明互相支持。包内存在扫码登录、submit、submit-status、submission-diff。主要可见流程是 www 练习题库、`sceneType:1`；ACM 官网使用不同场景。NC 显示题号与内部 questionId 不同。

包中的 repository 指向网站，不是可追踪的源码仓库。需要确认长期维护、依赖/素材声明、会话保存与原插件共存方案；不能仅凭包内 MIT 字段忽略其他组件许可。

### 蓝桥

当前官网基础地址 `https://www.lanqiao.cn/api/v2`；列表 `/problems/pc/` 匿名返回 JSON。当前学习页详情 `/problems/{id}/new/`，提交 POST `/problems/{id}/submit/`，记录 `/problems/{id}/submissions/` 与详情均有官网源码证据。匿名详情和列表记录返回 401。

[端点定义](https://assets.lanqiao.cn/lanqiao-fe/v7.52.19/dist/81c426c.js)、[提交流程](https://assets.lanqiao.cn/lanqiao-fe/v7.52.19/dist/b3233fc.js)、[详情流程](https://assets.lanqiao.cn/lanqiao-fe/v7.52.19/dist/7e09ece.js)。结果字段不等于全部隐藏测试输入输出；不扩大到赛事考试系统或绕过付费权限。

## 不能直接照搬的设计

1. 将 Cookie 导出交给扩展或模型、记录 token/CSRF 日志、共享日常 Chrome profile。
2. 通过通用执行脚本/任意 URL 请求接口给 Beacon 开放整个浏览器。
3. 用最新一条提交或同题旧 AC 作为本次结果；超时后自动再次 POST。
4. 以本地 CPH 通过表示线上 AC，或以历史 AC 表示当前未保存稿通过。
5. 把分页上限变成固定只取最近几条的产品缩水；把 401/验证码解释为没有记录。
6. 直接搬入依赖系统 PATH 编译器、外部 Chrome 或 Python 的整套插件，造成重复执行链。

## 候选最小职责

平台适配负责题目身份、查询、实际认证上下文和原始结果。浏览器所有者负责 session 与页面生命期。CPH 接收验证后的题目样例，本地运行仍归 Runner/CPH。Beacon 只读取脱敏、版本明确的材料；Notebook 仍仅在用户明确要求时整理。

候选材料应保留平台、题目/比赛上下文、实际账号与提交所有者、submission ID、时间、语言、源码快照/哈希、原始 verdict/阶段、单位、来源、覆盖与缺失。先用真实材料核对字段，再设计共享接口，不先建通用插件框架。

若将来批准用户主动提交：发送前固定源码和账号题目语言；仅发送一次；不确定时保存 unknown；取得唯一匹配的正式 ID 后追踪；取消轮询不等于撤销已发提交。重启后的恢复不得重发。该行为不注册为 Beacon 可调用工具。

## 许可与来源

| 参考 | 许可/限制 | 采用边界 |
| --- | --- | --- |
| 洛谷 VSIX | MIT；README 单独限制洛谷图标 | 保留版权，素材另审 |
| 牛客官方 VSIX | 完整 MIT；编译产物、未提供源码仓库 | 可先隔离兼容验证，依赖单独审查 |
| AtCoder-Helper / CPOS | MIT | 选择性参考，补回执和会话边界 |
| Inline for CF | GPLv3 | 复制时保留相应许可和来源 |
| Codeforces Workbench / Client | 前者保留所有权利，后者 MIT | 只评估 Client 许可覆盖的代码 |
| CF Submitter | LICENSE 授权正文不完整 | 澄清前不复制 |

## 实测与验收清单

用户已授权由其手动登录并测试提交，选择 AtCoder，并授权代理选择入门题及准备解答。已选 ABC086 A — Product；用户在独立测试窗口手动登录并提交，正式提交 `80773297` 已观测 AC，详情源码与准备文件忽略空白后一致。

| 验证 | 状态 | 通过依据 |
| --- | --- | --- |
| 静态源码、VSIX 与公开协议 | 已取得候选证据 | 上述来源及仓库所有者 |
| 五站匿名读取 | 部分完成 | CF user.status OK；蓝桥列表 200、受保护项 401；其余按既有研究限定 |
| 专用 BeCoder 环境启动 | 已启动进程、窗口可枚举；界面未验收 | 当前提交 staged 构建，独立 Portable 数据目录；窗口截图工具超时 |
| 人工登录、验证码、重启会话 | 登录已观测；验证码与重启待验证 | 用户手动登录后，当前构建内嵌页面显示账号欢迎信息与提交表单；不将比赛 Guest 标签误判为未登录 |
| 本人源码、CE、分页、结果 | AC 源码和逐测试点已读取；CE、分页待验证 | 正式详情页；只读取页面展示材料，不包含隐藏测试输入输出 |
| 指定源码测试提交与 ID 关联 | 本次 ID、AC、源码比对已验证 | 同一详情链接 `80773297` 从 WJ 更新为 AC，详情源码忽略空白后与准备文件一致 |
| 双窗口/导航/取消/重判/断网 | 待进行 | 不串账号/题目，不重发、不伪成功 |
| 产品实现、构建与负责人验收 | 实验命令前两次发现缺陷，第三版单条详情读取实测通过 | 11 项单测、构建与指定提交源码/判题核验通过；身份、CE、分页等未验收 |

本轮报告不承诺完成账号接入，不改变正式 PRD。下一步以真实会话验证消除阻塞，再形成小范围实施方案。

## 验证环境与检查记录

本轮检查发现 `.build/electron` 和 `out/main.js` 均不存在，不能直接启动当前源码开发实例。已有同级 staged 应用的 EXE 时间为 2026-10-28，早于当前 CPH 修复提交；其浏览器观测只能记作该旧产物证据，不能宣称验证当前分支。尚未启动任何日常实例或复制其账号数据。

文档检查入口来自 `docs/development.md`；文档检查仅覆盖文档。为真实账号实验另行执行了下述源码检查与 staged 构建。

| 命令 | 输入 | 结果与限制 |
| --- | --- | --- |
| `powershell -NoProfile -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1` | 仓库文档结构 | 已执行并通过；交付前重跑 |
| `git diff --check` | 已跟踪文件的差异 | 已执行并通过；新增未跟踪报告需另行检查 |
| Python 本地链接检查 | 本报告和 docs/README.md | 交付前执行；不宣称外链全部可达 |

未执行的包验证、Setup 和 GUI/真实账号旅程不计为通过。后续操作账号应补记确切题号、代码版本和观察结果。

### AtCoder 实测准备

用户已选择 AtCoder，并授权准备入门题解答。为取得当前提交的运行产物，冻结验证顺序为 `npm run typecheck-client`（120 秒）、`npm run compile-oi-extensions`（120 秒）、`npm run gulp vscode-win32-x64-min`（300 秒），工作目录为仓库根，命令来自 AGENTS.md 与 package.json。外部超时由 Python subprocess 控制，超时仅终止所启动的任务进程树；完整 stdout/stderr 写入忽略目录 `tmp/oj-connect-audit`。前项失败则不执行后项。

staged 构建会更新同级 `VSCode-win32-x64`；当前日常实例来自 D 盘其他目录，不占用该产物。构建后使用独立 Portable 数据目录，不读取日常账号数据。此轮不构建 Setup，不提交或推送文档。

| 命令 | 输入 | 退出码、耗时与证据 |
| --- | --- | --- |
| `npm run typecheck-client` | 当前分支客户端源码 | 0；13.70 秒；`tmp/oj-connect-audit/typecheck.log` 与 JSON |
| `npm run compile-oi-extensions` | 当前内置 OI 扩展 | 0；47.79 秒；同目录 `extensions.log` 与 JSON |
| `npm run gulp vscode-win32-x64-min` | 当前分支 Windows staged 应用 | 0；224.64 秒；同目录 `staged.log` 与 JSON；Electron 下载两次 ECONNRESET，内置重试后成功 |

构建外层包装器在打印日志尾部时因 Windows GBK 无法编码勾号而退出 1，属于日志输出编排失败；此时子进程已经退出 0、JSON 已写入，完整构建日志保留成功结束。随后使用 PowerShell 读取 JSON 和日志确认上述子进程结果；没有将包装器退出码当成构建失败或静默忽略源码失败。

新产物 `resources/app/product.json` 的 commit 为 `6bdd83cd39943a1132730ba5e608cb17db3d37c5`。以子进程环境变量 `VSCODE_PORTABLE` 指向仓库忽略目录 `tmp/oj-connect-audit/portable` 启动，未修改系统环境变量。已枚举到该产物窗口 `abc086_a.cpp - BeCoder`，与 D 盘日常实例分开。首次截图报 `FrameArrived timed out`；重新枚举并激活后重试仍报 `window capture timed out`，按工具恢复约束停止输入。尚未证实浏览器页面可用、登录、会话持久性或在线提交成功，等待用户手动操作。

练习题：[ABC086 A — Product](https://atcoder.jp/contests/abc086/tasks/abc086_a?lang=en)，已结束比赛的入门练习。源码 `tmp/oj-connect-audit/atcoder/abc086_a.cpp`，题解同目录 `题解.md`；源码 SHA-256 为 `b994bb99e221a22ad4529bad40eb847e38aa03d88b7ed309c09e3b0a61ef087d`。使用本地 g++、C++17 编译通过，`3 4`、`1 21`、`1 1`、`10000 10000` 四组样例/边界用例结果符合预期，记录见同目录 `local-validation.json`。这仅证明本地解答，不是 AtCoder AC 证据。

### AtCoder 登录后观测

用户回复已登录后，通过无截图无障碍读取，在当前 staged 应用的 `A - Product (atcoder.jp) - BeCoder` 窗口观测到官方题目 URL、账号欢迎信息、语言选择、源码输入与 Submit 控件。没有读取、导出或记录 Cookie/CSRF。页面同时存在 Cloudflare 安全质询组件，文本为 `Checking your Browser…`；这证明组件已加载，不证明验证已通过，也不证明被永久拦截。

无障碍点击语言框报 `coordinate input geometry is unavailable`，恢复截图仍报 `window capture timed out`，因此停止自动输入，请用户手动选择 C++、载入上述源码并提交一次。该失败属于电脑控制工具能力限制，不能归因于 BeCoder OJ 功能或网站接口。提交 ID、正式结果、源码一致性仍需观测；不使用页面题目、欢迎信息或本地结果替代提交回执。

用户回复已提交后，同一测试窗口的 `/contests/abc086/submissions/me` 页面出现一条正式记录：提交时间 `2026-11-12 13:01:10 +08:00`、题目 `abc086_a`、当前账号、语言 `C++23 (GCC 15.2.0)`（筛选链接语言 ID `6017`）、代码大小 `180 Byte`、状态 `WJ`、分数 `0`，Detail 链接明确指向 [80773297](https://atcoder.jp/contests/abc086/submissions/80773297)。这已证明网页提交获得正式 ID，WJ 阶段不能解释为最终零分或 AC。准备文件为 171 字节，尚不能用文件大小证明内容一致；需在详情中读取源码并处理换行差异后核对。

辅助匿名读取该详情时，Web 工具不可达，本机 Python HTTPS 请求报 `SSL: UNEXPECTED_EOF_WHILE_READING`；均未携带用户凭据。这是当前读取环境失败，不能解释为该提交无权限或不存在。已请用户在原测试窗口打开正式 Detail，以继续读取最终结果及源码。

随后再次读取同一内嵌窗口，Detail 链接仍为 `80773297`，该行更新为 `AC / 100`、`1 ms`、`3480 KiB`。这证明该环境下人工操作的登录→提交→正式 ID→最终 AC 网页链路可用；不是自动提交适配器、结构化状态接口或完整账号材料功能已经实现。

用户手动打开 Detail 后，窗口标题和文档 URL 均确认为该正式 ID。详情含提交时间、题目、本人账号、语言、分数、大小、状态、耗时与内存；判题分组 `Sample` 两例 AC、`All` 七例 AC，并列出七个测试文件名及各自状态/耗时/内存。没有取得隐藏测试的输入输出，也没有把七个测试点和两个样例重复计为九例。

无障碍文本中的完整 C++ 源码与本地准备文件对照：移除页面对象占位符及空白后相等。该简单程序的字符串和字符字面量中没有空白，因此此比对足以核对当前可见代码内容；不作为任意 C++ 文件的通用比对算法。在线大小为 180 字节、本地为 171 字节，未取得原始在线字节，不能断言仅换行造成差异，亦不能宣称原始 SHA-256 一致。脱敏核验记录写入忽略目录 `tmp/oj-connect-audit/atcoder/online-validation.json`。

本次结论：浏览器登录和提交的人工作业路径成立，按明确 ID 的详情页可提供本人源码与逐测试点判题材料，值得继续做窄范围读取适配。下一步优先验证已存在 CE 的编译错误文本（如无记录再单独准备测试）、历史分页与筛选完整性、重启后的会话保持及双窗口隔离，然后再定义结构化读取接口。提交动作仍归用户，Beacon 的正式边界不变；不得为完成研究自动新增错误提交。取消/断网恢复与自动化适配仍未验收。

## 当前页面读取实验 MVP

负责人确认内嵌网页操作可用并授权编写 MVP 后，新增实验命令 `workbench.action.browser.readAtCoderSubmission`，命令面板名称 `Read AtCoder Submission (Experimental)`。这是可行性探针，不是四站正式接入，也不连接 Beacon 工具或 Notebook。

在当前 AtCoder 正式提交详情页执行命令，打开未保存的 JSON 快照。首轮版本直接读已加载 DOM；真实文件核验发现该方式取得的源码受 Ace 渲染污染，未通过完整性验收。修正版改为当前实际 session 中固定同一详情 GET 的源码与已加载页面的判题表协作读取，仍待重新实测。`viewerIdentity: unverified` 明确表示尚未验证当前登录者与提交者相同，不能因此声明所有可见提交为本人记录。

修正版只向同一官方详情的固定路径发送一次 GET，去掉 query/fragment、使用 `redirect: error` 直接拒绝重定向；由当前 view 的 session 发起，不导出 Cookie。响应需为 200 HTML，流式上限 4 MiB，抽取唯一未渲染的源码 pre；完整 HTML 不执行、不写入日志或模型，仅将该源码片段在分离 textarea 中解码。页面导航/关闭、超时会中止请求。没有翻页、提交、网页编辑器调用或自动重试/轮询。JSON 附实际 sessionScope；其他身份/缺失校验保留，用户主动保存与宿主自动会话落盘分开。

固定 DOM 选择器在真实新版页面中的完整性仍待本次 MVP 运行确认；读不到时报告缺失，不能用此前无障碍文本比对结果代替该原型实测。当前七项自动测试覆盖读取控制器的身份/失败/清理边界，不证明实际 DOM 选择器、完整 CE、分页、登录持久化或线上取消已经验收。

验证记录：首先运行测试观察到六项因未实现而失败，完成实现后通过；补充加载/关闭/超大响应场景后共七项通过。最后客户端类型检查退出 0（10.82 秒）、ESLint `--max-warnings 0` 退出 0、OI 扩展编译退出 0（41.37 秒）、staged 构建退出 0（189.40 秒）。完整构建日志为 `tmp/oj-connect-audit/mvp-staged.log`；其下载阶段三次 ECONNRESET 后内置重试成功。没有执行 Setup、全仓库测试或完整包验收。

用户关闭专用实例后，沿用 `tmp/oj-connect-audit/portable` 子进程环境重启新构建；没有复制其他浏览器或日常实例的账号。窗口可读取无障碍状态，但自动键盘操作未打开命令面板，不能当作命令已执行。已交由用户在正式详情页执行实验命令并反馈 JSON/错误，以及重启后是否仍登录。此运行结果仍为待验证。

用户反馈“正常打开 json”，无障碍树也确认出现 JSON 类型的未保存编辑器，其内容结构可见 `tests` 字段；这支持真实命令入口与读取路径已运行成功。编辑器未启用无障碍文本访问，完整 JSON 暂不可读取，因此已请用户保存至忽略目录 `tmp/oj-connect-audit/atcoder/mvp-detail.json` 后核对。不能仅凭打开编辑器宣称源码和逐点表完整。

用户实际保存为 `tmp/oj-connect-audit/atcoder/Untitled-1.json`。核验正式 ID/题目/状态和提交信息表正确，但 `source` 前缀混入行号，后缀混入 Ace 测量字符，换行丢失；`tests` 还重复采集嵌套表格。该轮 runtime 记为失败，不能以已通过控制器单测或打开 JSON 来冲销。根因为 `#submission-code` 已成为 Ace 编辑器容器，以及后代 `tr/th/td` 选择器跨越嵌套表格。

修复不是过滤特殊字符或截取可见行：前者可能损坏合法源码，后者可能遗漏虚拟化部分。新源码路径拒绝已经渲染成 DOM 的 pre，保留实体与换行解码来源标记；表格改取属于本层 table 的行、行的直接单元格，并排除嵌套 table 单独重复采集。新增原始 pre 提取与导航后实际 AbortSignal 中止回归，观察到 7 通过/2 失败后实现修复，共 9 项通过。修正版类型检查退出 0（6.84 秒）、零警告 ESLint 退出 0、OI 扩展编译退出 0（24.17 秒）、staged 构建退出 0（94.03 秒）。已用同一独立 Portable 目录重启，等待修正版 JSON；没有据此宣称第二轮 runtime 通过。

同一窗口保留的 AtCoder 详情文档显示 `Sign In / Sign Up`。因此本次成功至少包含匿名可见详情读取，不是登录保持成功的证据；当前账号仍未核实。源码 `_resolveStorageScope()` 在非空且不可信工作区强制使用 Ephemeral，默认其他场景使用 Global；临时会话不持久化。但当前实例的实际会话 scope 尚未采集，不把受限模式横幅直接等同于该分支已命中，也不擅自修改信任或隐私设置。后续身份/会话实验需分别记录实际 scope、页面登录者和提交者。

第二轮真实运行截图报 `atcoder-source-response`，未生成成功材料。根因调查发现实现额外要求 `response.url === 请求地址`，但 [Electron 43.7.3 官方文档](https://raw.githubusercontent.com/electron/electron/v43.7.3/docs/api/net.md) 明确说明主进程 fetch 的 Response.url 不正确，源码中的 net.fetch 也委托 session.fetch。用校验过官方 SHA-256 的本地 Electron 43.7.3 缓存包、独立临时 session 和本地 HTTP 服务实测：200 HTML 的 response.url 为空；redirect:error 确实拒绝 302，跳转目标请求数为零。日志 `tmp/oj-connect-audit/electron-transport-probe.log`，没有访问用户 Cookie 或远端网站。

第三版移除对不可靠 response.url 的依赖，改为请求层拒绝重定向，保留 200、精确 HTML MIME、非空正文与大小/源码结构检查。失败只报告状态码及 HTML/正文布尔值，不输出响应内容、凭据或跳转地址。新增响应回归先观察 9 通过/2 失败，再修复至 11 项通过。此处是确定的本地实现缺陷，不据第二轮截图声称网站返回了 403/验证码，也不声称所有远端请求已成功；第三轮源码与表格真实核验仍待进行。

第三版额外使用同版本真实 Electron 隐藏窗口和隔离合成页面执行实际抽取脚本：包含 Ace 污染、嵌套表格、合法数字、Unicode 与换行，完整源码和非重复本层表格均通过；不是远端网站验收。其初次探针在 did-stop-loading 前过早读取，被加载保护拒绝，修正探针时序后通过。最终类型检查退出 0（7.53 秒）、零警告 ESLint 退出 0、扩展编译退出 0（24.80 秒）、staged 构建退出 0（199.20 秒），新测试实例已启动。仍需新 JSON 或具体响应诊断来判定当前 AtCoder 请求。

### 第三轮真实结果：单条详情读取通过

用户保存 `tmp/oj-connect-audit/atcoder/mvp-detail-fixed.json` 后直接核验：来源 URL、提交 ID `80773297`、contest `abc086`、题目 `abc086_a`、AC/100 分与官方详情一致；判题表共 14 行，包含分组/成员关系/逐点表，七个测试文件各出现一条独立结果，均 AC，原始 ms/KiB 单位保留，嵌套行重复已消除。

JSON 解码后的 source 重新编码为 UTF-8 为 171 字节，与本地准备文件逐字节相同，SHA-256 同为 `b994bb99e221a22ad4529bad40eb847e38aa03d88b7ed309c09e3b0a61ef087d`。这比首轮忽略空白的比对更强，证实当前样本的换行/字符未丢失；不将解码后的 171 字节等同于网站展示的 180 Byte 原始提交传输字节。

快照读取时间为 2026-11-12 15:23:51（北京时间），实际 sessionScope 为 `global`。这不证明登录账号或登录持久化，亦不能倒推此前每次浏览器 view 的 scope；viewerIdentity 仍为 unverified。校验输出为 `tmp/oj-connect-audit/atcoder/mvp-verification.json`，完整样本仅保留在忽略目录，未写入 Beacon 对话或 Notebook。

本次 MVP 证明：当前环境下宿主绑定实际浏览器 session 的固定同一详情 GET，以及当前页判题 DOM 提取可以协作取得一条准确材料。该结论限当前提交和网站版本，不宣称完整同题历史、CE、长期稳定接口或本人账号查询已完成。下一步优先验证既有 CE 记录的完整编译错误，再核对当前登录者/提交者与同题历史分页，随后覆盖登录失效、长源码、页面导航与取消的真实行为。没有自动新增错误提交或放开 Beacon 登录/交题能力。
