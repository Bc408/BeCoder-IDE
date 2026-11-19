# OJ Connect 四站维护审查与分阶段方案（2026-11-19）

## 状态、范围与证据

负责人本轮明确确认：洛谷、AtCoder、Codeforces、牛客四站已经各自达成核心能力闭环。本报告以这一最新产品确认作为维护基线，历史文档中的“候选／待验收”仍只描述各自当轮。以下审查行号与发现以初次审查基线为准；随后分别批准的第一、二阶段实施见文末补记，第三阶段后续已实施，当前结果见[题面读取优化结果](statement-optimization-2026-11-19.md)。

- 源码基线：OJ_connect / 4e8864641e73d6c955fae2be6b7db4fff8096b5c；开始审查时工作区干净。
- 上游基准：完整 vscode-luogu 4.20.0 / 987ca974b5419230a07b59a195ec44026e16f6f4，本地位于 tmp/oj-connect-audit/luogu-full-review/upstream；未调查其后续版本。
- 分工：三个只读子审查分别覆盖导航与消费者、洛谷核心与文案、首屏性能；主审另核对共同控制器、面板、源码绑定、数据校验、会话缓存及关键宿主路径，并复核下列引用。
- 初次审查实际执行：源码与既有证据阅读、静态消费者分析、内存中加载实际 TypeScript 的面板复现、文档落盘与文档检查。当时没有改产品代码、启动产品、访问真实账号、联网采证、发送提交、构建、提交或推送；后续第一、二阶段的代码与验证分别单列于文末。
- 结论分为“源码／本地探针已确认”和“待测量／待决定”。没有把旧测试、合成网页或构建成功当成本轮真实网站运行验收。

产品目的仍是围绕当前 C/C++ 源码完成看题、显式导入样例、提交和查询本次结果。扩展拥有工作流与共同界面；浏览器宿主拥有持久会话、固定请求、正式回执和权限检查；CPH 拥有本地样例与测试。此次不重构四站提交、认证或回执协议。

## 第一阶段：导航去冗余与扩展清理

### R1 / P2：标题的一次点击进入两条导航路径

位置：

- [题面标题](../../extensions/becoder.oj-connect/webview/luogu/problem.tsx)，第 73 行。
- [记录标题](../../extensions/becoder.oj-connect/webview/luogu/record.tsx)，第 177 行。
- [内置导航](../../extensions/becoder.oj-connect/src/extension.ts)，第 70 行。
- [Webview 通用链接桥](../../src/vs/workbench/contrib/webview/browser/pre/index.html)，第 535—563 行。

两个标题的 React onClick 只 preventDefault，随后发送 openOriginal。面板将固定官网 URL 交给 workbench.action.browser.open，按现有 openToSide 行为打开内置浏览器。

同一个 click 继续冒泡到 Webview window 监听器。handleInnerClick 不检查 defaultPrevented，仍从 HTTPS 锚点发送 did-click-link；[mainThreadWebviews.ts](../../src/vs/workbench/api/browser/mainThreadWebviews.ts) 第 99—102 行进入通用 opener，桌面 [window.ts](../../src/vs/workbench/electron-browser/window.ts) 第 809—811 行的默认外部 opener 最终调用 nativeHostService.openExternal。因此 preventDefault 没有阻止第二条路径。Ctrl/Meta 点击和聚焦链接后的 Enter 也没有独立分支。

导航子审查对实际 handleInnerClick 的只读函数探针确认：预先 defaultPrevented 的事件仍产生 did-click-link。它证明桥接函数行为；负责人报告的双开现象与这条调用链一致，本轮未重跑真实 Webview 点击。

### R2 / P2：普通记录链接和正文链接直接走外部打开器

[record.tsx](../../extensions/becoder.oj-connect/webview/luogu/record.tsx) 第 179 行“所属题目”没有自管导航。题面 [problem.tsx](../../extensions/becoder.oj-connect/webview/luogu/problem.tsx) 第 41 行挂载的正文经 [共享 DOM 生成器](../../extensions/becoder.shared/browser/content/dom.ts) 第 22 行保留已清洗 href；[共享 parser](../../extensions/becoder.shared/content/parser.ts) 第 138—164 行把嵌入内容转为普通 HTTPS 链接。这些链接均可进入通用外部 opener。只给标题补 stopPropagation 会遗漏这些入口。

现有页内 fragment 跳转应保留：共享 parser 与 DOM 为 id／href 加安全命名空间，Webview pre 负责滚动到本页目标，不应改成官网导航。

侧栏没有同类外开路径：站点名称 button → loginView → loginModel.openAccount → 固定登录命令或现有内置 opener。Webview 默认右键只有编辑动作，OJ manifest 没有外部链接菜单；中键 auxclick 由 pre 第 569—585 行阻止默认导航，本轮源码未发现它外开的路径。内置 BrowserView 自己的右键有明确的 Open Link in External Browser，见 [browserViewMainService.ts](../../src/vs/platform/browserView/electron-main/browserViewMainService.ts) 第 1261—1262 行，属于用户明确选择的外部动作。

**建议的统一规则，待确认：** OJ 题面／记录页的可导航 HTTPS 链接统一打开内置浏览器；本页 # 锚点仍本页滚动。扩展不新增外部按钮；需要外部浏览器时，用户可在内置浏览器使用已有明确外部动作。若今后增加扩展级外部入口，UI 必须明确写“在外部浏览器打开”，不能从普通标题、异常或恢复分支静默外开。

最小实现范围：在 OJ Webview 根节点建立单一链接处理，覆盖标题、记录题目、正文和转换后的嵌入链接；非 fragment 的合法 HTTPS 链接 preventDefault + stopPropagation 后只发送一次受校验的内置导航动作。面板消息校验 URL 类型、长度、HTTPS、无用户名密码，拒绝其他协议；不启用任意命令 URI。移除标题各自重复的 openOriginal 点击路线，统一保留现有内置命令与侧边打开行为。中键保持现有不导航语义，键盘和修饰键统一进入同一 click 路由。

作用域限定本扩展的消息和导航。不改全局 Webview pre、mainThread opener、共享清洗器或 Beacon 行为。

### R3 / P3：查看源码还会附带滚回记录页顶部

[record.tsx](../../extensions/becoder.oj-connect/webview/luogu/record.tsx) 第 187 行使用 href="#"，处理器只 preventDefault。Webview pre 第 546—547 行仍会 scrollTo(0, 0)。建议改成保持链接视觉的语义 button，或明确停止传播；源码查看仍在本地文本编辑器中打开记录源码快照，不导航浏览器。验证须从记录页中部点击并检查返回后的滚动位置。

### 消费者审查：清理应按证据执行

以实际构建的 extension.ts、markdown.ts、webview/main.tsx、site-scripts/entry.ts 四个入口建立相对 import/export 图，另外核对 import type／export type：51 个 TS/TSX 源码模块均有真实运行时或类型消费者。其中 50 个可从运行时入口抵达；adapters/adapter.ts 是被真实消费的纯接口模块。未发现可整文件删除的孤立源码模块。

| 候选 | 证据 | 后续边界 |
| --- | --- | --- |
| OperationError.stage | [operationError.ts](../../extensions/becoder.oj-connect/src/operationError.ts) 第 9 行只在构造时赋值，扩展／测试／脚本没有字段读取 | 可同步移除无消费者参数；delivery、record、message 仍控制错误恢复，保留错误类型与这些字段。若改动量超过局部清理价值则单列暂缓，不顺带改错误模型。 |
| 旧 AtCoder 专用输入、选择、进度文案 | [中文 bundle](../../extensions/becoder.oj-connect/l10n/bundle.l10n.zh-cn.json) 第 4—6、9 行；已由 extension.ts 第 86、93、105 行的四站共同文案取代 | 逐条移除已证明无生产者／消费者的旧键，同步检查 UI 和宿主错误。 |
| 不含 CF 的旧三站 URL 提示 | 同 bundle 第 48 行；现入口使用包含四站的提示 | 可移除旧键，保留当前四站翻译。 |
| 其他无字面量命中的 l10n 键 | AST 探针覆盖 135 个相关运行时源文件，177 个 key 中 61 个没有字面量命中 | 只是候选。[messages.ts](../../extensions/becoder.oj-connect/src/messages.ts) 第 29 行动态 t(message) 消费宿主错误，不能批量删除 61 条。 |
| manifest 本地化 | package.nls.json／zh-cn 所有键均有 manifest %key% 消费 | 保留。 |

明确保留：四站 adapter/host 验证与取消释放、SourceBinding 和 SourceStore 的资产保护、MarkdownService 的缓存和 in-flight/generation 语义、CPH 窄接口、站点读取与取消脚本、共享清洗和公式／语法 Worker。hasDraft/replaceDraft 仍被 AtCoder 当前表单、bridge 与控制器实际消费，不能因为另三站没有草稿而删除共同保护。CSS 的作者内容类和动态状态也不能按文本命中直接判死。

## 第二阶段：洛谷标杆、文案与展示边界

### 原洛谷核心的可复用规则

已对照上游题面 app、submissionControls、record app/data、shared.RecordStatus、workspaceUtils 的验证码交互，以及当前裁剪后的共同组件。上游核心操作 UI 直接使用中文，英文判题术语来自 RecordStatus；“对齐洛谷”不等于把整个产品界面改成英文。

建议确认：操作、提示与无障碍文案随产品中英界面；整体判题名称、测试点状态和诊断术语保持洛谷风格英文；官方编译器名称、题目原文和诊断原文保留站点语义。无需改动站点协议中的原始状态值。

| 表面 | 上游依据 | 当前状态／建议 |
| --- | --- | --- |
| 正常判题名 | 上游 src/utils/shared.ts 第 10—112 行 | 本地 [record.tsx](../../extensions/becoder.oj-connect/webview/luogu/record.tsx) 第 26—131 行已保留 Waiting、Judging、Compile Error、Accepted 等完整名称与短名；保留。 |
| 额外站点状态 | 原洛谷表不覆盖全部状态 | QLE、IE、PE、细分运行错误、Skipped、Rejected、Partial 等保留真实含义；不硬改成洛谷已有的另一种判词。WJ/WR 的现有映射有回归约束，修改需另有站点证据。 |
| 提交 | 上游 submissionControls.tsx 第 64—69 行 | 继续统一 Submit {fileName}／提交 {fileName}，无文件名时 Submit Code／提交代码。 |
| 语言选择 | 上游“选择提交语言” | 控件的无障碍名称建议 Submission language／提交语言；选项保留本站完整编译器版本。已采证与当前目录说明保留，提交前校验不变。 |
| CPH | 上游 viewProblem/app.tsx 第 100 行“传送至 CPH” | 题面维持 Send to CPH／传送至 CPH。浏览器 Import to CPH 是从网页导入的另一真实入口，不能为文案一致将动作混淆。 |
| 记录标题 | 上游 record/app.tsx 第 29 行“记录详情” | 中文保留；英文可由 Submission 收敛为 Submission Details。 |
| 信息行 | 上游 record/app.tsx 第 31—116 行 | 所属题目、评测状态、分数、时间、语言、代码长度、源代码已共同化；缺失数据省略，零值只在真实数据成立时展示。 |
| 查看源码 | 上游“在 vscode 中查看” | 维持 View in BeCoder。牛客来源提示必须仍说明是本次发送快照，不能改称已从官网回读。 |
| 编译区 | 上游 record/app.tsx 第 137—142 行 | 中文编译信息／成功／失败保留；英文区标题可用 Compilation Details，统一真实缺失输出说明。 |
| 测试点 hover | 上游 record/app.tsx 第 248—260 行的 description、Received signal、points、Exit with code | 当前英文判词及真实得分／信号／退出码保留。Score: n 与 n points 属文风差异；不为此改协议。CF 不恢复输入、输出、答案或 checker 测试内容。 |
| 验证码与恢复 | 上游 workspaceUtils.ts 第 221 行起与既有裁剪 | 图片输入／留空刷新／取消及三次拒绝边界保留；继续查询只能读原 ID／attempt，不能重发。 |

### R4 / P2：结果读取登录失败提示会诱导重交

[messages.ts](../../extensions/becoder.oj-connect/src/messages.ts) 第 10 行把 codeforces-login-required 固定翻译成“登录……然后重新提交”。该错误不仅来自准备提交，也会由已获正式 ID 的 readRecord → list → parseCodeforcesList 抛出，见 [codeforcesSessionClient.ts](../../src/vs/platform/browserView/electron-main/codeforcesSessionClient.ts) 第 124—127、225—235 行和 [codeforcesProtocol.ts](../../src/vs/platform/browserView/electron-main/codeforcesProtocol.ts) 第 168 行。

结果页 [recordPanel.ts](../../extensions/becoder.oj-connect/src/views/recordPanel.ts) 第 34 行将它显示在“无法更新”后，又提供“继续查询”，两个恢复方向矛盾。建议共同登录提示只要求登录；结果页明确“登录后继续查询这条记录”。准备阶段确实未发送时才提示重新发起提交。只改错误呈现上下文，不改受理判定、身份校验或发送动作。

### R5 / P2：首次查询失败后仍显示“正在读取”

[record.tsx](../../extensions/becoder.oj-connect/webview/luogu/record.tsx) 第 180 行在 snapshot 缺失时无条件显示 labels.tracking；recordPanel.ts 第 34—35 行首次失败后却已设置 tracking=false。因此错误和继续查询出现后，状态行仍像在自动请求。

建议无快照且 tracking=true 才显示“正在读取”；已停且无快照时显示“暂未读取到评测结果”。已有快照保留最后真实状态，具体错误与继续查询仍在。这是共同展示层修复。

### R6 / P2：重读后的正文未使用，后续动作仍引用首次文档

[extension.ts](../../extensions/becoder.oj-connect/src/extension.ts) 第 179—187 行每次看题都先完整 readProblem。[problemPanel.ts](../../extensions/becoder.oj-connect/src/views/problemPanel.ts) 第 43—47 行同 SourceBinding 复用分支却只更新 languages/languageError，丢弃新 title/bodies/samples/limits。第 62—70 行的切语言、提交上下文、CPH 仍闭包引用首次 document。

主审在内存中转译并加载当前 problemPanel.ts，替换 VS Code UI／文件 identity 边界，不写磁盘、不请求网络。先输入 Original／Old statement，再对同源码同 URL 输入 Updated／New statement；观测为一个面板、仍显示 Original／Old statement，提交动作上下文仍是 Original。该结果证实新文档没有被消费，不能据此宣称提交到了错误题目——题目 URL 本身仍固定且有校验。

本轮推荐保留当前 Ctrl+Alt+P 重新读取题面的调用次序，完整使用已取得的新文档，并同步更新动作引用、locale 和样例，防止只更新画面却仍从旧闭包导入样例。无须为这项一致性修复新增缓存或改变请求协议。“已有面板立即唤起／同题合并”留作性能候选单独讨论：须核对当前持久 Session 的 storage scope、生命周期代次和源码 identity；当前 sourceUri＋题目 URL 的面板 key 不包含这些条件，不能直接作为未来的复用授权。编译器刷新与提交前校验保持。

### R7 / P3：通用复制和缺失编译输出提示不完整

- [webview.ts](../../extensions/becoder.oj-connect/src/views/webview.ts) 第 19 行的复制失败提示专指“样例”；同一 [copyablePre.tsx](../../extensions/becoder.oj-connect/webview/luogu/copyablePre.tsx) 第 19—23 行还展示编译输出，题面代码也共用复制处理。建议 Copy failed. Select the text and copy it manually.／复制失败，请选择文本后手动复制。
- record.tsx 第 200 行的缺失编译输出说明只给 AtCoder CE；牛客与 CF 的 compileSucceeded=false 且无 compileMessage 也可达。建议以该事实条件统一缺失提示，不推断没有返回的编译成功信息。
- extension.ts 第 176、183 行把“提交前聚焦源码／未提交代码”也用于看题；共同前置条件改为聚焦 C/C++ 源码，看题失败不再描述提交结果。

### 需验证或决定后再处理的边界

1. **AtCoder 账号改变后的记录缓存语义。** 主审与导航子审查均确认：[browserViewMainService.ts](../../src/vs/platform/browserView/electron-main/browserViewMainService.ts) 第 618—619 行识别真实 identity 变化，但第 558—565 行只失效账号／语言读取；工作台第 142 行失效终态缓存时排除了 AtCoder，第 296—303 行同 storage scope 可直接返回旧缓存；主进程第 923—924 行 initial 快照也不检查身份代次。由此可确定缓存不随真实身份变化失效，尚需确认产品是否允许继续展示原已授权的公开记录。公开记录本可公开读取，不把它描述为已证实的隐私泄露。若统一身份失效规则，建议只改读记录缓存的代次与在途回填边界；普通 Cookie 轮换和登录页导航不能都当作账号改变。该项不应混入文案清理后静默实施。
2. **连续快捷键的晚回包抢焦点。** extension.ts 第 179—187 行没有看题请求的共享代次或合并；readProblem 的 AbortSignal 也未贯通普通命令路径。连续从两份源码看题时，完成顺序可能改变最终显示。源码提示了风险，本轮尚未运行完整宿主并发复现；先做延迟夹具，再决定同题合并与不同题请求的展示规则，不引入等待队列。
3. 旧报告的键盘复制与原生 HTML fragment 问题，当前已有 opacity/focus-within、HTML id 与 fragment 重写实现；本轮未按旧报告重复认定为未修复缺陷。

## 第三阶段：首屏性能准备

### 已确定的关键路径

| 阶段 | 当前路径与源码位置 |
| --- | --- |
| 命令到请求 | extension.ts 第 179—187 行先 await adapter.readProblem，再 revealSource、创建 panel。请求成功之前没有题面 Webview。 |
| 后台页面 | [browserOjConnectFeature.ts](../../src/vs/workbench/contrib/browserView/electron-browser/features/browserOjConnectFeature.ts) 第 170—217、247—258 行解析存储范围、复用精确 URL 或创建隐藏页、等待模型与页面可读。 |
| 页面就绪 | browserViewMainService.ts 第 317—350 行只对新建、仍隐藏、任务拥有的页在 DOM-ready 后停止剩余资源；已有／可见页仍正常整页加载。 |
| AtCoder 二次 GET | [site-scripts/atcoder.ts](../../extensions/becoder.oj-connect/site-scripts/atcoder.ts) 第 11—20 行在已导航的题页内再 fetch 同一 problem.url，same-origin credentials、redirect:error、cache:no-store，再 DOMParser 解析原始 HTML。 |
| CF 提取 | browserViewMainService.ts 第 352—385、450—478 行先执行 CPH 当前 DOM parser，再执行 [codeforcesProblem.ts](../../extensions/becoder.oj-connect/site-scripts/codeforcesProblem.ts) 第 39—70 行题面 recipe；当前普通题没有同类第二次网站 GET。 |
| 宿主清理 | browserViewMainService.ts 第 389—423 行加载本地脚本、隔离读取并 finally await cancelOjRead；各段当前没有完整端到端计时。 |
| 前端可读 | webview.ts 第 38—58 行建页；problem.tsx 第 27—55 行每 section 发 renderContent，宿主 MarkdownService 按需加载清洗／KaTeX 后回 HAST，DOM 挂载。高亮 Worker 在文本已经呈现后补充。 |

**不能据源码认定的原因：** 20s 页面上限、15s parser 上限、10s recipe 上限都是超时，不是成功请求必等。显式轮询是 openPage 的 100ms。watchOjSession 第 521—555 行只装监听，不发账号网络查询。编译器目录已在 panel 创建后后台读取，不是当前首屏串行依赖。

AtCoder 的第二次原始 HTML 请求具有明确的内容保护目的：保留公式、双语正文和样例原文。直接改读被站点脚本／MathJax 改写的 DOM 会有内容回退风险。CF 虽有两段本地解析，目前没有证据证明其足以解释十几秒。

### 上次证据的限制

tmp/oj-connect-audit/first-open-20261119/final-review.md 已明确区分合成就绪测试与真实网站延迟。scripts/test-oj-problem-ready.cts 的 slow.png 是人工 1200ms 延迟，只验证隐藏页停止资源的所有权条件；既有 ready 日志不包含真实 Ctrl+Alt+P 到正文的时间。readonly*.log 的 1267/1558/6681ms 是 CF submit 目录探针，不是题面端到端。此前 Node 渲染材料也不覆盖产品 Webview 资源通道与真实网络。

### 建议先采的一轮阶段数据，待确认

只在用户明确看题后记录 site、临时 flow ID、阶段、本地 duration、成功／受限错误码及 created/reused 等分支标签。不记 URL、题号、文件路径、账号、Cookie、HTML 或源码，不新增遥测服务或长期采集。

阶段至少包含：命令 handler、resolveStorageScope、model resolve、navigation、DOM-ready／stop／load-stop、AtCoder 第二次 GET 的 headers/body、CF 两段提取、recipe 清理、revealSource、panel create、Webview ready、renderer 首次加载／parse、首个非空正文插入后的 rAF。全体正文、图片及高亮完成另记。ready 不能当正文可读；rAF 只作为近似绘制边界，不声称已实际上屏。

各进程用自己的单调时钟记录 span，不能直接相减不同进程的 performance.now。主链总量在同一发起端收结束报告。若只从扩展 handler 开始，应明确不含物理按键派发与首次扩展激活；另看现有激活性能记录。

每站区分本进程首次看题、同进程新题、同题隐藏 reader、同题可见网页、已有 panel 五种情形，每组保留 3—5 次原始时长和中位数。失败不混入成功平均值。只读公开题面，不新增真实提交，不导出登录数据。具体运行与采样在批准后执行。

### 优化候选和取舍

| 候选 | 优先级与收益依据 | 风险与前置 |
| --- | --- | --- |
| 已有效面板立即唤起／同题请求合并 | 改善重复使用的候选，可减少重复读题 | 先批准 show 与 refresh 语义；有效性须包含当前持久 Session storage scope、生命周期代次、源码 identity，不能只按现有面板 key 合并；保留编译器校验。不能宣称解决冷首开。 |
| AtCoder 一份原始文档完成读题 | 冷首开首要研究候选，有确定串行二次 GET | 先量其占比；同 Session 固定 GET 与原始解析的单一路径需独立验证公式、双语、样例、限制、跳转／验证与取消。若涉及接口／传输调整，单独出设计，不直接套用到 CF。 |
| renderer 首次加载与本次读题 I/O 并行，或事件替换 100ms 轮询 | 本地阶段实测占比明显时再做，收益预计较有限 | 只在明确看题请求后启动；不预热账号／提交页；事件必须防丢失并保留原失败上限与生命周期。 |

不以缩短认证超时、跳过 Session/owner/route 检查、跨账号持久缓存或后台预热掩盖延迟。此次性能完成指标是实际正文更早可读和阶段耗时可解释，固定秒数目标在测量后确定。

## 待确认的执行次序与验收

推荐采用分阶段有界维护：

1. 导航统一和已证明的扩展小规模清理；保留蓝色标题打开内置浏览器的效果。
2. 修复错误恢复方向、停止读取状态与通用文案；完成中英表面矩阵。重复看题保留重新读取并完整更新文档与动作数据；立即唤起／请求合并留在性能讨论。身份缓存与并发风险先补复现，未证实／未确认的语义不夹带修改。
3. 采集 AtCoder/CF 阶段数据，再围绕实测主因提出性能改动；涉及原始文档传输的变更独立设计和验证。

另一个方案是同轮改读题传输、文案、清理与面板生命周期；冷首开若确由二次请求主导可能更早受益，但会扩大因果和回退排查范围，不建议作为第一轮实现。

实现验证按实际改动冻结命令表与台账。导航需同时有消息边界用例、真实 Webview 链接桥／可信点击检查，覆盖四站标题、记录、正文、fragment、Ctrl/Meta/Enter、中键、源码查看；当前独立网页 render 用例不加载真实 Webview pre，不能单独证明系统外开为零。文案用例覆盖读取已有 ID 时登录失效、首次读取失败、保留旧快照、CE 无输出、复制失败以及中英界面。清理要核对静态与动态消费者，运行拥有者类型检查与回归。

后续如批准实现及 stage，仍按仓库要求执行最终源码检查与构建，使用已有 Electron 缓存，保留当前 stage 和个人数据，不清缓存、不自动发提交。阶段构建、真实点击、网站新提交与负责人验收分别记录；任何阶段的通过都不能概括为已证明零能力回退。

以上记录初次审查与方案讨论时的授权边界；后续第一、二阶段的批准和实施见下文，没有新的 Git 发布。

## 本轮检查记录

| 检查 | 命令／输入与结果 | 证据边界 |
| --- | --- | --- |
| 基线 | git status --short --branch；git log -3 --oneline，均退出 0 | 起始工作区干净，基线为上述 commit；未联网重读远端。 |
| 面板问题复现 | node tmp/oj-connect-audit/review-20261119-maintenance/reproduce-panel-stale.cjs，退出 0；Node v24.17.0，TypeScript 来自已安装的根依赖；预先确认源文件存在，内存 transpileModule 加载实际 problemPanel.ts | 输出 panels=1、displayedTitle=Original、displayedContent=Old statement、submittedContext=[Original]；仅 UI／文件 identity 边界为 mock，探针不写产品文件或请求网络。 |
| 文档结构 | powershell -NoProfile -ExecutionPolicy Bypass -File .agents/skills/develop-becoder/scripts/validate-project-docs.ps1 -RepositoryRoot C:/Users/Bc/Desktop/BeCoder/BeCoder_maintenance，退出 0 | 结构检查通过，不证明产品功能。 |
| 文档链接与空白 | node tmp/oj-connect-audit/review-20261119-maintenance/validate-docs.cjs，退出 0 | 两份文档、76 个本地目标、末尾换行和行尾空白检查通过，包含未跟踪的新报告。 |
| 已跟踪差异 | git diff --check，退出 0 | 不用它代替未跟踪新报告的内容检查。 |

完整冻结命令、普通文件输入、退出码及原始输出保留在本地忽略目录 tmp/oj-connect-audit/review-20261119-maintenance/validation-plan.json 与 validation-ledger.json。文档复核后修正了“只读源码编辑器”的不准确措辞，并补齐未来面板复用的 Session scope／生命周期条件；最终文档检查按实际落盘内容重跑。

## 第一阶段实施补记

负责人在上一轮方案结尾确认进入第一阶段修改。本次完成导航统一和已确定的冗余清理；没有把第二阶段的文案、面板文档更新或第三阶段性能改动提前实施。

### 当前源码变化

- OJ Webview 的根节点统一处理链接。题面和记录标题移除独立 openOriginal 回调，记录所属题目、正文及转换后的嵌入链接走同一个 openLink 动作，继续调用 workbench.action.browser.open，保留 openToSide。
- 非片段链接停止默认行为与冒泡；前端和宿主共用消息校验，只允许有界、无账号密码与控制字符的 HTTPS URL。非法链接不进入默认 opener，也不建立无法获得回复的请求。
- # 片段继续交给原有 Webview 内页滚动；中键保持不导航，右键只保留菜单行为；Ctrl/Meta 点击和键盘 Enter 都走同一路径。查看记录源码停止冒泡，不再附带滚回顶部。
- 删除 47 条已核对无现行消费者的旧非状态翻译。动态错误生产者对应的 20 条与 18 条状态翻译保留；其他本地化所有者的 Import to CPH 入口不受影响。完整删除集合保留在本地 stage1-cleanup-keys.json。
- 暂留 OperationError.stage：删除参数需要机械触及提交与评测控制器的 13 处核心构造调用，本阶段按报告中的风险边界选择保留。没有删除源码模块、缓存、草稿保护或取消释放路径。

### 验证与审查

冻结命令位于本地 stage1-checks.mjs 与 plan.json，逐次命令、输出、退出码及失败分类位于 ledger.jsonl。均在 tmp/oj-connect-audit/review-20261119-maintenance/ 下。最终产品源码对应的结果为：

| 检查 | 实际命令 | 结果 |
| --- | --- | --- |
| 扩展类型 | npm run typecheck，扩展目录 | 退出 0，含宿主／站点脚本／Webview／内容类型 |
| 扩展生产 bundle | npm run build，扩展目录 | 退出 0 |
| 扩展测试 | npm test，扩展目录 | 129 项通过，另有内容解析／缓存／共享策略回归通过 |
| 可信点击与渲染 | npm run test-render，扩展目录 | 退出 0，四站导航及原有渲染矩阵通过 |
| ESLint | 根 node_modules/eslint/bin/eslint.js，冻结的 9 个改动源／测试文件 | 退出 0，无警告 |
| 客户端类型 | npm run typecheck-client，仓库根 | 退出 0 |
| OI 扩展编译 | npm run compile-oi-extensions，仓库根 | 退出 0 |

导航用例从本仓库实际 Webview pre/index.html 取出 handleInnerClick，将其装入本地 Chromium fixture，以 Playwright 可信点击观测默认桥消息；没有调用操作系统外部打开器。四站标题、记录标题、所属题目、正文、嵌入链接每次只发一个内置动作，通用链接桥消息为零；同时覆盖修饰键、键盘、中键、右键、非法协议、跨 section 片段及源码查看滚动位置。测试先在旧实现复现标题 did-click-link，再通过最终实现。

这是实际桥接函数与产品 Webview bundle 的局部集成检查，不能称为完整 Electron Webview／新 stage 的运行验收。主审查看了本轮生成的 AtCoder 紧凑题面和 CF Accepted 记录截图；独立只读审查未发现产品代码阻断，指出的文档状态陈旧已在本次补记中修正。主审另复核了职责边界、URL 校验、取消与源码动作未改变。

### 失败尝试与交付边界

- 首次审计 runner 的 Playwright 相对路径多退一层，预检退出 1，属于编排错误；修正到已确认的根依赖后重做预检，目标检查当时未启动。
- 单测和标题点击的预期 TDD red 已记录。附加右键用例抓到实现初稿把右键 auxclick 当普通导航，已修正；非法协议用例促使前端在发消息前也复用相同校验。
- 渲染夹具曾未把源码链接滚出顶部，另一个旧断言依赖原生 location.hash；接入真实 Webview 桥后应观察 scrollIntoView 目标。调整本地夹具与断言后完整矩阵通过，未为此修改产品片段行为。
- 测试日志仍有既有 Node 模块类型和 npm 配置提示，不通过改变产品 CommonJS 包边界或用户环境来消除。最终退出码与各检查实际结果以上表为准。

本次没有改浏览器宿主、站点脚本或提交／鉴权／回执协议，没有新增第三方依赖、配置或许可证变更。只生成检查所需的扩展输出与本地截图；保留现有依赖、缓存、stage 和个人数据。没有生成新 stage／Setup，没有启动产品或发送真实提交，也没有 commit／push。后续仍需将候选构建后由负责人验证实际点击与四站日常流程。

## 第二阶段实施补记

负责人确认继续第二阶段后，按 R4—R7 实施共同文案与已确认的展示边界修复。第一阶段改动保留；没有实施原始题面传输、账号缓存代次或连续快捷键调度策略。

### 已实施行为与保护条件

1. AtCoder／CF／牛客的精确 login-required 提示统一只要求从侧栏登录，去掉与读取既有记录矛盾的“重新提交”。结果读取失败补充继续查询原记录、不会重发代码；仍调用相同 RecordRef。没有把 session-changed、未知账号、HTTP、验证或超时错误重新解释为明确未登录。
2. 首次没有 snapshot 且读取已停时显示“暂未读取到评测结果”；真正读取中才显示等待与转圈。已存在 snapshot 的失败保留最后真实判词与资源，重试和关闭后的迟到响应仍由原控制器处理。
3. 四站明确 compileSucceeded=false 且无 compileMessage 时统一说明编译输出不可读；true／undefined 不推断成失败，也不补造诊断。真实编译日志保持原字面量与空白。
4. 操作、提示和无障碍名称随中英界面，整体判题和测试点说明继续使用洛谷风格英文。提交语言下拉框明确标为 Submission language／提交语言；英文记录标题为 Submission Details，编译区为 Compilation Details；中文仍为记录详情／编译信息。复制失败使用通用“选择文本后手动复制”，不再专指样例。看题的聚焦源码和未接入提示不描述提交结果。
5. 相同 SourceBinding 再次看题仍先按原流程重新读取，再完整替换 panel.state.problem，包括删除新文档没有的旧 difficulty/tags；标签标题同步更新。提交、CPH、locale 与语言选择读取动作开始时的当前文档，源码 URI／对象与 identity 检查保持。AtCoder 优先保存的英／日偏好，缺失语言回退后可以在后续文档恢复原偏好；其他站保留有效当前选择，否则按界面语言回退。空正文没有虚构 locale。
6. 语言偏好异步保存完成后，再检查 locale 是否仍在当前文档中；编译器选择完成后核对原 entry、文档与目录身份，避免等待期间重开或刷新目录后把旧选项铺回来。后台目录原有 entry／request／abort 检查不变，回包只合并当前文档的语言字段；没有引入跨会话面板复用或全局请求队列。

### 本轮证据

预检确认现有命令、配置、文件与缓存 Chromium；命令清单位于本地 stage2-plan.json，逐次结果在 stage2-ledger.jsonl，runner 为 stage2-checks.mjs。路径均在 tmp/oj-connect-audit/review-20261119-maintenance/，不进入产品或 Git。测试先在旧代码观察到重交指引、完整文档未更新、编辑组标签未更新及复制失败文案等预期失败，然后修改实现并重跑。

| 检查 | 命令／范围 | 最终结果 |
| --- | --- | --- |
| 扩展类型 | npm run typecheck，扩展目录 | 退出 0 |
| 扩展生产 bundle | npm run build，扩展目录 | 退出 0 |
| 扩展回归 | npm test，扩展目录 | 131 项通过，另有内容／缓存／共享策略回归通过 |
| 四站中英渲染与导航 | npm run test-render，扩展目录 | 退出 0；沿用第一阶段可信点击与 fragment 检查 |
| ESLint | 根 ESLint，冻结的 13 个源／测试文件 | 退出 0，无警告 |
| 客户端类型 | npm run typecheck-client，仓库根 | 退出 0 |
| OI 扩展编译 | npm run compile-oi-extensions，仓库根 | 退出 0 |

新增面板回归覆盖完整替换、元数据删除、当前 CPH／提交数据、目录旧回包、AtCoder 偏好恢复、其他站当前语言保留与回退、空正文、等待中的语言保存与重开、同 ID 查询恢复、已有快照后 session-changed 仍保留真实状态，以及标签标题和看题错误文案。原 SourceBinding、失效编译器、草稿、单次发送和关闭取消回归继续运行。

渲染夹具改为读取实际 labels() 与中文 bundle，不再独立手抄可见标签。四站分别在中英界面覆盖初次读取停止／读取中、CE 缺失输出、true／undefined 编译状态、实际诊断原文和编译日志复制失败；原样例／正文代码复制、英文评测术语及来源说明矩阵继续运行。主审查看了本轮 CF 中文停止状态、牛客英文缺失编译输出、CF 中文与 AtCoder 英文复制失败截图。独立只读审查未发现本轮产品代码阻断，主审另核对了当前文档所有权与恢复路径。

文档、链接、JSON 与差异检查在最终落盘后记录。本阶段没有额外的非预期检查失败；预期 TDD red 和既有 Node/npm 提示保留于原日志，不将这些输出隐藏为“从未失败”。

### 交付与后续

本阶段未改主进程、站点适配协议、发送、正式回执或账号缓存；没有新增依赖、配置或许可变化。当前未提交改动包含第一、二阶段，未生成新 stage／Setup，未启动产品或操作真实账号，也未 commit／push。源码与局部渲染通过不等于四站新构建运行验收。

在第二阶段收口时，第三阶段仍从脱敏分段测量开始；账号改变后的 AtCoder 缓存语义和连续看题晚回包策略未在第二阶段解决。随后负责人已授权连续推进，第三阶段的隔离基线、具体取文实现、取消边界、实测取舍与最终交付分别见[诊断结果](statement-performance-2026-11-19.md)和[优化结果](statement-optimization-2026-11-19.md)。
