# AtCoder / CF 题面读取优化结果

2026-11-19。负责人要求继续推进至收敛，按[具体设计](../superpowers/specs/2026-11-19-oj-connect-statement-acquisition-design.md)与[实施计划](../superpowers/plans/2026-11-19-oj-connect-statement-acquisition.md)实施。基线为[前轮正式隔离诊断](statement-performance-2026-11-19.md)，不是已作废的错误隔离批次。

## 改变和保留

AtCoder／CF 看题改为同一原生 Session 的固定官方题页单次 GET，再在每请求新建的离线本地 sandbox 中解析原始 HTML。不再等待官网导航，也不依赖“DOM-ready 后停止加载、再校验并派发网页脚本”的路径，因此前轮 AtCoder 失败所在的旧派发窗口已移除；新的 bundle 读取、派发与回包仍检查取消／窗口／Session，不靠删 guard 掩盖失败。

AtCoder 保留原 DOMParser 后的双语、公式、样例空白、说明索引、章节、标题与限制；CF 保留 Companion 原 Codeforces parser 和 TaskBuilder 的样例换行，再由 OJ 整理同份文档中的正文、公式和说明。未新增 npm 依赖。浏览器 Get 的页面归属／题号继续校验，并保留网页本身的 Session，包括临时会话；快捷键读题继续只用本窗口当前 Global／Workspace 会话。普通内置网页与 Import to CPH 不导航、不停止、不改其他题源。

固定 GET 无 source body、无账号导出，拒绝其他 URL／method、自动重定向、非 HTML、超限与迟到结果；原始响应限 8 MiB UTF-8 bytes，业务文档独立限 8 MiB。旧 AtCoder 原始 HTML 曾按 UTF-16 code units 限长，本轮明确收紧为流式字节上限。15 秒网络限时、10 秒本地解析限时；结束即释放请求与本地 contents。无页面池、预热、队列、持久题面缓存、自动重试或失败后导航备用路线。

提交、登录／认证、正式回执、受理不明仅查询、结果追踪、SourceBinding、C/C++ compiler 偏好和前两阶段导航／文案保持。没有真实交题、登录或个人源码修改。

## 同题集真实对照

两轮均在同机同网以标准 Electron 43.7.3 运行真实源码产品入口；每个进程拥有独立 portable／shared／extensions／logs，先核对生效路径，再只读观察产品创建的 Session 路径，不主动预建 Session。AtCoder 为 abc086_a／abc081_a，CF 为 4/A／71/A，每站三轮分别 first／next／repeat，串行操作真实 Ctrl+Alt+P。优化后合计 **18 次尝试、18 次正文确认**（每站 9 次）。没有失败／挑战，无自动重试；每次均保存真实正文截图。

指标是 handler 到当前正文 rAF 确认，沿用诊断时同一扩展时钟；不含按键派发和扩展首次激活。首次进程不代表网络冷缓存。以下是有限样本的实测比较，不能当作长期可靠率或网络 SLA。

| 站点／组 | 基线中位数 | 优化后中位数 | 优化后最慢 | 中位数变化 |
| --- | ---: | ---: | ---: | --- |
| AtCoder 首次 | 7.262s（2 成功，另 1 失败） | 1.934s | 1.943s | 减少 73.4% |
| AtCoder 后续新题 | 2.615s | 0.982s | 1.685s | 减少 62.5% |
| AtCoder 同题重开 | 1.616s | 1.050s | 1.256s | 减少 35.0% |
| CF 首次 | 5.586s | 1.574s | 2.152s | 减少 71.8% |
| CF 后续新题 | 1.117s | 0.864s | 0.897s | 减少 22.7% |
| CF 同题重开 | 0.076s | 0.598s | 0.901s | 增加约 0.522s |

| 站点／组 | 优化后原始总量 ms，按 1／2／3 轮 |
| --- | --- |
| AtCoder first | 1943.289 / 1933.937 / 1736.383 |
| AtCoder next | 981.666 / 1685.464 / 809.502 |
| AtCoder repeat | 1050.184 / 866.651 / 1256.205 |
| CF first | 1574.339 / 1536.443 / 2151.660 |
| CF next | 896.626 / 864.090 / 854.654 |
| CF repeat | 590.322 / 598.047 / 900.554 |

CF 重开回退是明确取舍：旧路径重读已加载 DOM，新路径每次重新 GET 官网原始文档，因此有网络成本；本轮不以额外缓存或绕过重读隐藏这项代价。当前目标是用户报告的新题首次等待，两站三轮首次均显著低于基线成功样本，已超过设计中位数改善 25% 的门槛。没有声称全部场景都提速。样本相隔约一小时，网络波动可能影响幅度；架构上也已确定去掉官网页面资源依赖及 AtCoder 的第二次串行请求。

## 最终候选验证与审查

对照完成后已移除全部临时 diagnostic context／span／action／开关／日志／renderer observer 及专属测试。共同面板恢复前两阶段已验证实现，删除无生产消费者的旧网页题面读取、DOM-ready 监听和旧任务 helper；浏览器 Get 汇入同一固定新路径并保留 Session 所有权。

最终源码检查通过：扩展 132 项及内容／缓存／共享策略，四站中英渲染／导航，client 类型、transpile、OI 编译，native 11 项、workbench 52 项，ESLint 和分层检查。撤诊断后的独立实例两站均确认正文与编译器可见、诊断消息数为 0；该确认单列，不混进对照时长。文档及差异在最终落盘后校验，stage 结果独立记录。

独立审查发现并修复浏览器临时会话 Get 的兼容性问题：不能仅凭 storageScope 重新选择持久 Session，必须使用已验证 owner 的原始 BrowserSession，并在每阶段验证同一网页和 URL。该网页导航或关闭时立即取消对应请求，结束释放监听；新增回归覆盖原始临时 Session 及导航／关闭取消。主代理另复核分站提取语义、原维护文件、信号取消与诊断零残留；最终独立只读审查无未解决阻断问题。

中间失败保留在本地 ledger：解析壳缺少 crypto.randomUUID，现仅在该 trusted 本地环境使用宿主生成 UUID；关闭 contents 初次未等 destroyed，现 finally 等实际销毁；撤诊断时出现 CRLF 导致的遗漏 import，修复后重跑。一个已删除诊断测试的过期生成文件仍被 npm test glob 选中，旧签名导致超时，已精确删除四个过期生成输出并重跑，不清缓存或其它产物。传输第一组用例在并行构建时已读到实现，未形成预期 red，不将该次通过伪称 red；原始解析与离线 parser 回归实际观察到 red 后通过。

## 误用数据清理与边界

负责人明确允许清理前轮误用的 `C:/Users/Bc/Desktop/data`。独立只读核对其创建／最后写入与诊断日志一致、只有本次 synthetic workspace、根及全部祖先／子项无 reparse、无该目录相关运行进程后，主代理再次验证精确绝对路径并删除整棵本次生成树（530 项）。记录在 `cleanup.json`；其他安装、stage、源码、缓存和个人数据目录没有清理。未读取 Cookie／账户数据库内容。

本轮无 commit／push、Setup 或发布。最终 stage 使用已有固定 Electron ZIP 缓存，源码验证、隔离源码实例和 stage／负责人验收分别成立。

## 本地证据与最终状态

证据根为 `tmp/oj-connect-audit/statement-optimization-20261119/`：`baseline/` 保留开工快照，`commands.json`／`ledger.jsonl` 记录精确检查，`measured-站点-N/` 记录隔离和 18 次对照，`comparison.json` 保留完整精度统计，`final-atcoder/`／`final-codeforces/` 单列撤诊断后的真实产品确认，`cleanup.json` 记录获准清理。

本轮达到约定收敛条件：首次中位数改善超过 25%、同题集 18/18 正文确认、临时诊断撤除、最终检查通过、独立审查无阻断。`npm run gulp vscode-win32-x64-min` 于 2026-11-19 17:54（Asia/Shanghai）退出 0，Gulp 报告耗时 2.65 分钟，使用已有 Electron 43.7.3 ZIP，SHA256 为 `b11a1bf50c1fc4eb8b9ca99cfbb557daab284d739b20f45c1b3b6ce9f673cb32`。完整构建日志为本轮证据根的 `stage-1795082078651.log`，最终清单为 `final-candidate.json`。

交付入口为 `C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。该最终 stage 尚待负责人实际体验验收；没有把构建成功或隔离源码实例的画面确认称为最终 stage 已完成负责人验收。
