# AtCoder / Codeforces 题面首屏诊断

本文件保留诊断结束时的历史基线和边界。负责人随后授权继续到收敛，单文档取文已实施、临时诊断已撤下，当前结果与 CF 同题重开的取舍见[优化结果](statement-optimization-2026-11-19.md)。误用的 Desktop/data 也已按明确授权清理，详见该记录；下文“未实施／未清理”描述的是诊断结束时点。

日期：2026-11-19。按[批准设计](../superpowers/specs/2026-11-19-oj-connect-statement-performance-design.md)及[实施计划](../superpowers/plans/2026-11-19-oj-connect-statement-performance.md)完成诊断。本文只给出真实基线、失败和逐站决定；尚未实施取文优化，不能将数字称为优化收益。

## 结论

真正隔离、未登录的成功样本中，AtCoder 进程首次题面为 6.484、8.039 秒，中位数 7.262 秒；CF 为 3.131、5.586、6.118 秒，中位数 5.586 秒。AtCoder 另有一次 4.017 秒后失败，未展示正文，不能计入成功耗时。

两站首次主要时间都在页面准备／文档就绪；AtCoder 还有确定的串行同题 GET，在重开题时几乎独占等待。CF 的 CPH 与 recipe 解析不是首次秒级等待的主因。建议 AtCoder 进入同一 Session、单份原始 HTML 读题的具体设计；CF 独立设计降低只读题面取得对浏览器导航的依赖。取文接口、固定路由和失败语义仍须具体落盘审阅，当前不改提交、认证或评测链路。

本轮 handler 指标未达到负责人报告的十几秒，不代表该体验不存在：这里不含快捷键派发和扩展首次激活，网络与站点响应也会波动。本次没有 p95、长期可靠率或固定秒数 SLA 结论。

## 隔离纠正及证据边界

最初使用产品重命名的开发 runtime `.build/electron/BeCoder.exe`，虽然指定了 CLI profile，启动后 `app.isPackaged=true` 仍触发 `configureBeCoderPackagedDataRoot`，把 VSCODE_PORTABLE 强制改到 `C:/Users/Bc/Desktop/data`。这覆盖了 user-data-dir。直到最终运行时路径复核才发现，是本轮执行的隔离预检缺陷。

此前六轮 17 个成功，以及修正前两站单次确认中的 CF 成功／AtCoder 失败，**全部排除正式统计**，不能宣称隔离或未登录。旧草稿另存审计目录 `invalid-report-draft.md`；旧日志、截图与 `aggregate.json` 继续保留，不用新结果覆盖。没有主动导出 Cookie、登录或提交源码；应用正常启动可能已经在该既有目录写入窗口、缓存等状态，未擅自恢复或删除该目录。

第一版隔离修正又在路径断言时主动创建了目标浏览器 Session，可能把 Session 初始化移出 handler；该 `isolated-atcoder-1/` 轮次也排除统计。最终 runner 不再主动创建 OJ Session，只观察产品正常触发的 `session-created` 路径。

正式结果仅来自 `measured-atcoder-1..3/` 与 `measured-codeforces-1..3/`。修正方法是使用已存在的同版本 `node_modules/electron/dist/electron.exe`（43.7.3，含标准 default_app.asar）运行同一仓库真实产品入口 `out/main.js`，不是合成 BrowserWindow，也未篡改 app.isPackaged 或生产数据根。每轮使用全新 portable／shared／extensions／logs 目录。下列前三项在任何看题动作前断言，第四项在产品正常创建 Session 后只读核对：

- `app.isPackaged === false`，appPath 为仓库根，Electron 为 43.7.3。
- 生效的 portable 正是本轮目录，userData 精确等于 portable/user-data，sessionData 与 defaultSession.storagePath 均在本轮目录。
- CLI extensions、shared、logs 均为本轮独有位置；共享数据库已在本轮 shared/sharedStorage 下建立。
- 只读观察到的产品浏览器 Session 路径均在本轮 portable/user-data/Partitions 下；不读取 Cookie 内容。

各轮 `isolation.json`、`session-paths.json` 和 main.log 保存了实际路径证据。原 stage、下载缓存和既有数据目录不清理、不覆盖。显式环境变量只作用于测试子进程，没有修改用户或系统环境。

## 正式方法与保护范围

源码基线为 `OJ_connect / 4e8864641e73d6c955fae2be6b7db4fff8096b5c` 加前两阶段未提交修改与本轮临时诊断；没有用旧 stage 测量新源码。实施前复制了 20 个普通改动文件及原差异，保留此前成果。

每站三个独立进程轮次，串行依次看 A、B、重开 B；AtCoder 为 abc086_a／abc081_a，CF 为 4/A／71/A。合成 C++ 位于本次审计工作区，普通工作区信任检查保持，通过 UI 确认该合成目录。没有导入日常 profile、登录、操作提交按钮或 Ctrl+Alt+S、导入 CPH 样例；只执行打开文件、聚焦和 Ctrl+Alt+P。零源码 POST 的依据是这些受限动作及现有固定读题链路，不声称抓包验证了全产品网络。

主指标是看题命令 handler 起点到当前 flow／文档 revision／当前语言的首个非空可见正文 section 在 rAF 后回报扩展。总量由扩展单一单调时钟取得，其他进程只回传本地 duration；不相减跨进程时间，不等待图片或完整高亮。每个成功另有实际产品截图和当前题面 iframe 非空正文检查。rAF 是近似绘制边界，截图证明随后正文可读，不精确证明首个像素时间。

未清任何机器网络缓存；全新 profile、进程首次不等于网络冷缓存。新增计时默认关闭，仅本次子进程 `BECODER_OJ_STATEMENT_DIAGNOSTICS=1` 启用。Perf 日志只允许 site、临时 UUID、固定 phase、有限 branch／duration／outcome，不含 URL、题号、账号、令牌、HTML、正文或源码。失败 envelope 只把有界原错误交回 main 重抛，不写错误正文；sidecar 剥离后继续原文档校验，原业务 8 MiB 上限独立计数。

## 总量、失败与未执行槽位

单位：毫秒。中位数／最慢值仅取成功总量，失败不作为零值加入。

| 站点／组 | 已尝试 | 成功 | 失败 | 成功原始总量，按轮次 | 中位数 | 最慢 |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| AtCoder 进程首次题 A | 3 | 2 | 1 | 8038.733 / 6484.316 | 7261.524 | 8038.733 |
| AtCoder 后续新题 B | 2 | 2 | 0 | 2317.844 / 2912.521 | 2615.183 | 2912.521 |
| AtCoder 同题重开 B | 2 | 2 | 0 | 1961.139 / 1270.712 | 1615.926 | 1961.139 |
| CF 进程首次题 A | 3 | 3 | 0 | 5586.293 / 6117.570 / 3131.219 | 5586.293 | 6117.570 |
| CF 后续新题 B | 3 | 3 | 0 | 1117.212 / 1210.888 / 951.419 | 1117.212 | 1210.888 |
| CF 同题重开 B | 3 | 3 | 0 | 81.463 / 76.486 / 75.889 | 76.486 | 81.463 |

计划 18 个槽位，正式执行 16 次：15 次成功、1 次失败。AtCoder 第 1 轮首次失败后停止该轮，后续新题和同题重开两个槽位未执行；没有自动重试、换传输、登录或补成功值。没有观察到明确挑战页面，不能据此保证不存在挑战。

AtCoder 失败样本：prepare=4000.300ms、其中 document-ready=3945.413ms，extract=0.668ms，total=4016.854ms，结果 failed。无 headers／body／parse／cleanup，未创建正文面板，发生于固定脚本派发前的页面校验附近。已确认该失败未被当作快速成功；当时收集器未留到具体固定错误码，分类为 unclassified。不能仅凭这个时序断言是网络、登录或导航 race，也不能绕过当前页面／会话检查。下一步单文档设计与验证应覆盖“文档就绪后、固定脚本派发前页面再次改变／loading”的边界。

## 分段原始数据

prepare 是页面准备与就绪；extract 是 main 固定取文全段；panel 是本次文档接收确认；render-reply 是首段转换请求的宿主处理跨度；body-mount 是前端收到转换结果至 rAF。单位：毫秒。— 为未执行／无数据。

| 站点／轮次／组 | 结果 | prepare | extract | panel | render-reply | body-mount | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AtCoder 1 first | 失败 | 4000.300 | 0.668 | — | — | — | 4016.854 |
| AtCoder 2 first | 成功 | 6834.000 | 498.843 | 589.805 | 87.476 | 101.000 | 8038.733 |
| AtCoder 2 next | 成功 | 749.900 | 1324.191 | 203.722 | 15.325 | 16.400 | 2317.844 |
| AtCoder 2 repeat | 成功 | 0.900 | 1876.102 | 38.979 | 1.082 | 12.500 | 1961.139 |
| AtCoder 3 first | 成功 | 5441.700 | 503.734 | 451.168 | 84.596 | 76.300 | 6484.316 |
| AtCoder 3 next | 成功 | 1675.200 | 1006.906 | 185.043 | 14.087 | 15.700 | 2912.521 |
| AtCoder 3 repeat | 成功 | 1.100 | 1203.502 | 39.364 | 1.251 | 6.700 | 1270.712 |
| CF 1 first | 成功 | 5054.000 | 20.546 | 493.297 | 74.209 | 8.000 | 5586.293 |
| CF 1 next | 成功 | 826.300 | 98.467 | 156.084 | 4.111 | 3.600 | 1117.212 |
| CF 1 repeat | 成功 | 1.600 | 10.290 | 36.397 | 1.120 | 2.200 | 81.463 |
| CF 2 first | 成功 | 5571.900 | 21.894 | 503.082 | 71.277 | 8.900 | 6117.570 |
| CF 2 next | 成功 | 878.900 | 152.661 | 141.506 | 3.078 | 9.000 | 1210.888 |
| CF 2 repeat | 成功 | 1.000 | 14.311 | 37.487 | 0.807 | 1.500 | 76.486 |
| CF 3 first | 成功 | 2608.900 | 19.411 | 465.141 | 77.478 | 9.100 | 3131.219 |
| CF 3 next | 成功 | 675.000 | 81.528 | 152.659 | 3.681 | 9.700 | 951.419 |
| CF 3 repeat | 成功 | 1.100 | 10.749 | 37.537 | 0.874 | 1.700 | 75.889 |

首次和后续新题均为 created-hidden + new-panel；重开为 reused-hidden + existing-panel。首次 renderer 是 cold-renderer，同进程后续是 cached-renderer。没有把合成 visible 分支回归当作真实可见用户网页耗时。新建 reader 的 document-ready 是 prepare 内部子段，成功样本范围 AtCoder 725.301–6778.271ms、CF 657.871–5520.430ms；重开不再次等待它。

| 站点／轮次／组 | AtCoder headers / body / parse | CF companion / recipe |
| --- | --- | --- |
| AtCoder 1 first | — / — / — | — |
| AtCoder 2 first | 482.400 / 3.400 / 5.300 | — |
| AtCoder 2 next | 1249.500 / 0.700 / 5.000 | — |
| AtCoder 2 repeat | 1869.500 / 0.600 / 2.200 | — |
| AtCoder 3 first | 485.700 / 7.400 / 3.700 | — |
| AtCoder 3 next | 933.300 / 0.500 / 3.700 | — |
| AtCoder 3 repeat | 1196.900 / 0.400 / 2.500 | — |
| CF 1 first | — | 11.222 / 1.800 |
| CF 1 next | — | 64.775 / 2.800 |
| CF 1 repeat | — | 5.953 / 0.600 |
| CF 2 first | — | 12.575 / 1.800 |
| CF 2 next | — | 70.951 / 1.800 |
| CF 2 repeat | — | 9.857 / 0.800 |
| CF 3 first | — | 9.992 / 1.700 |
| CF 3 next | — | 52.330 / 2.000 |
| CF 3 repeat | — | 5.912 / 0.800 |

首次 renderer load 为 61.070–68.565ms；首次 parse：AtCoder 19.831–21.758ms，CF 7.709–9.112ms。新面板交付约 142–590ms，首次面板约 451–590ms；有改善余地，但当前主要等待仍在网络／页面准备。cleanup 为 0.395–7.878ms，已包含在 extract。

跨度具有嵌套和重叠：document-ready 属于 prepare；站点取文／解析／cleanup 属于 extract；新面板 render 可以先于 document-received ACK 完成，panel 与 render-reply 重叠。不能将五列相加或从 total 减尽子段强凑“交接”。只把 total−prepare−extract 称为“未被 prepare/extract 覆盖的本地与交接时间”，成功样本范围 61.176–705.890ms；包含面板、渲染、通信，也可能含题目识别和 openPage 前存储范围解析，不能解释成纯渲染。

## 逐站决定

AtCoder：两个成功首次样本的 prepare 约占总量 84%–85%；额外同题 GET 首次响应头约 482–486ms，后续／重开为 933–1870ms，解析仅约 2–5ms。重开时 prepare 约 1ms，仍有 1.2–1.9 秒额外 GET。证据支持优先设计同一持久 Session 的单份原始 HTML 路线；潜在收益来自减少页面依赖与串行取文。须复用原始双语、公式、样例空白提取语义，固定官方题路由、重定向／登录／挑战、8 MiB、取消与释放；不能拿 MathJax 改写后的 DOM 替代，也不能丢弃本次真实失败边界。

CF：三个首次样本 prepare 占总量约 83%–91%，extract 约 19–22ms。后续新题 extract 有 82–153ms，仍低于页面准备，CPH 约 52–71ms、recipe 约 2ms。应独立设计降低只读题面取得对浏览器导航的依赖；当前不值得先重写 CPH／recipe，也不能将 AtCoder 的“删第二次 GET”套给 CF，不能把提交 Session client 扩成通用网络层。真实样例、公式、题目上下文和其他 CPH 题源保持。

共同本地阶段：首个面板约半秒，renderer load/parse 是其中部分重叠跨度；可在取文优化后继续细化面板启动成本。当前先不引入持久缓存、页面池、跨请求队列或启动预热，也不把 100ms 轮询当成已证实的十几秒主因。正式优化必须使用相同样本、同机同网和相近时段对照；没有具体接口的可行性与改善证据前，不承诺固定节省秒数。

## 验证、审查与失败记录

最终源码矩阵已通过，完整命令、输入、退出码及失败尝试保留在 ledger.jsonl 与原日志：

| 检查 | 最终结果 |
| --- | --- |
| 扩展 typecheck / 完整 npm test | 退出 0；140 项及内容／缓存／共享策略回归通过 |
| 扩展 build / Chromium test-render | 退出 0；当前 revision 正文、空正文、复用面板与前两阶段四站导航／中英文矩阵通过 |
| client typecheck / transpile / compile-oi-extensions | 均退出 0 |
| workbench 聚焦用例 | 56 passing |
| 默认 Electron renderer 的原取消 suite | 4 passing（含框架清洁检查和原 3 项）；4 个主进程专属用例明确 pending |
| Electron main 实际执行同一 suite | 7 passing，包含失败 envelope／cleanup、大小边界和失败分段 |
| ESLint / valid-layers-check | 退出 0；ESLint 无警告 |
| 汇总规则回归 | 2 项通过：失败不算成功，分组／单一时钟总量正确 |

预期 TDD red 与意外失败分别保留。初次骨架未使用字段、集成中的可空访问／测试返回类型，以及跨 realm 断言误判均修复并重跑。新增 main 用例最初顶层导入 service，使既有 renderer 测试入口加载失败只输出 {}；这是本轮测试兼容性缺陷，修为 main 内动态导入、renderer 显式跳过 main 专属项，并在 main harness 实际执行，未掩盖退出 1。

独立只读审查指出并修复失败分段丢失、后台标签误标可见、枚举白名单过宽、sidecar 缩小业务大小边界和测试加载兼容性；主代理另复核当前文档／section 关联、诊断默认关闭、日志字段及未新增站点请求。旧批次隔离缺陷已公开纠正，正式六轮全部在最终源码必要矩阵通过后运行。正式样本不是合成用例；失败和未执行槽位也未用本地测试补值。

文档结构、相对链接／JSON／空白及 git diff --check 在最终文档落盘后确认。既有 npm 配置提示、Node 模块类型提示与 Git 行尾提示保留原日志，不把它们写成产品失败或完全无提示。

## 临时变更移除清单与交付边界

当前工作区是隔离诊断候选，默认关闭也不等于已可分发。正常交付前应按清单撤去临时诊断，并对最终源码重跑检查；不能用 git 回退覆盖前两阶段修改。

1. 删除临时 statementDiagnostics.ts、statementDiagnostics.test.ts 及 d.ts 中诊断 context／phase／branch／span／document／failure 类型。
2. 撤去扩展 showProblem、AtCoder／CF adapter 与 CommandHost 的临时参数、span 消费及生命周期终结，保留原业务文档校验。
3. 撤去 workbench／browserView 的临时参数、context／span 校验、sidecar／失败 envelope 和 perf 日志；保留窗口、Session、固定路由、大小、取消、导航、可见性和资源释放检查。
4. 撤去站点脚本临时时间点与失败 envelope，恢复原错误传播，不改解析语义。
5. 撤去 PanelState 的临时 flow／revision、专用 action、render 关联、rAF 报告和 MarkdownService observe；同时撤去 webview/main.tsx 为诊断加入的 window.__OJ_STATE__ 状态同步赋值，除非后续另有明确保留理由。保留前两阶段的文档刷新、文案和普通消息保护。
6. 移除仅用于诊断的断言、测试依赖和 main 专属用例，保留原业务回归。本地 runner、baseline、ledger、无效／有效统计和截图保留在忽略目录，不进入扩展或发行资产。

无正式 stage／Setup，无 commit／push。源码通过、真实只读样本、取文优化收益和负责人新构建验收分别成立。真实 AtCoder 页面校验失败仍是已记录的待处理问题，不声称已经修复。

## 本地证据索引

审计根：`tmp/oj-connect-audit/statement-performance-20261119/`。

| 材料 | 文件 |
| --- | --- |
| 前置工作区保护 | baseline.json、baseline.patch、baseline/ |
| 验证 | commands.json、ledger.jsonl、各检查原始 .log |
| 正式实例隔离证明 | measured-站点-N/isolation.json、session-paths.json、launch.json、logs/main.log |
| 正式完整精度数据 | measured-站点-N/spans.jsonl、results.json，根 aggregate-measured.json |
| 正式真实画面 | measured-站点-N/first.png、已执行的 next.png／repeat.png |
| 失效旧批次 | atcoder-N／codeforces-N、两站 -verification、旧 aggregate.json、invalid-report-draft.md；全排除 |
| 失效的 Session 提前创建探针 | isolated-atcoder-1/；排除正式基线 |

## 最终状态

诊断实现、最终源码检查、正式有限采样及独立只读复核已完成；文档结构、117 个本地链接、JSON／空白与差异检查通过。独立审查复核了正式统计、隔离证明、失败及移除清单，已提出的诊断问题均修正；主代理另作最终语义与保护范围复核。当前终点是本报告和逐站决定，不宣称取文优化或真实 AtCoder 失败已解决。
