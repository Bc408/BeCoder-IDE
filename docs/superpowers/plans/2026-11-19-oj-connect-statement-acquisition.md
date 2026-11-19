# OJ Connect 单文档取文实施计划

> 使用 executing-plans 连续执行；负责人已授权推进直到收敛。主代理实现，独立调查并行，最终独立只读审查。无自动 Git 或 Setup 操作。

**Goal:** 两站单次 GET、原始内容一致、首屏可重复提速，撤下诊断并生成最终 stage。

**Architecture:** 当前原生 Session 固定 GET；短命离线 sandbox DOM 复用原解析；扩展和共同题面不接收 HTML。无官网题页导航或第二次 GET。

**Spec:** [单文档读取设计修订](../specs/2026-11-19-oj-connect-statement-acquisition-design.md)。

## 保护与复核重点

四站提交／认证／回执／评测、源码绑定、compiler 偏好、样例／公式、内置导航与已完成文案保持。特别验证：请求取消早于登记、bundle 读取中取消、scope 改变／扩展停止后回包、恶意整页资源、响应体错误／超限／重定向。记录每次 red、意外失败和最小重跑，保留原诊断及本轮快照。

## Task 1：固定 GET 与离线解析

**Files:** 新建 `src/vs/platform/browserView/electron-main/ojStatementTransport.ts`、`ojStatementParser.ts` 及相邻测试；修改 OJ `site-scripts/{atcoder,codeforcesProblem,entry}.ts`、CPH `companion/entry.ts`；现有构建入口保持。

**Interfaces:** transport `createOjStatementRead(session, requestFactory?)(problem, signal): Promise<string>`；parser `parseOjStatement(problem, html, bundles, signal): Promise<ProblemDocument>`，固定 bundles 为 trusted 本地文件内容，只有 native 内部可调用；不暴露任意执行接口。

- [x] 固定 GET、同Session/无body、登录／重定向、类型、8MiB、取消、超时回归及实现通过；该组首次测试读到并行实现，未观察到 red，偏差见结果报告。
- [x] raw/current 解析一致与双语／公式／样例换行回归观察 red 后通过，已抽取纯函数与固定 raw 入口。
- [x] 真 Electron 验证离线资源和脚本不执行、取消／错误关闭；固定本地壳不持有真实 Session。

## Task 2：接入当前命令与取消边界

**Files:** `browserView.ts`、`browserViewMainService.ts`、`browserOjConnectFeature.ts`、扩展 `browserHost.ts`、AtCoder／CF adapters；相邻测试。

**Interfaces:** service `readOjStatement(windowId, scope, problem, requestId)`／`cancelOjStatementRead(windowId, requestId)`。临时对照期可传既有 diagnostic context，测量后移除。固定原命令签名只增加内部 requestId，不接受窗口来源参数。

- [x] workbench 测试两站零题页创建、原用户页保持、当前scope、停用／scope改变拒绝迟到结果，已通过。
- [x] main 请求与 tombstone 有界登记，GET/解析前后校验，finally释放；扩展传abort并拒绝迟到回包。
- [x] 跑拥有者测试、client/transpile、OI、lint/layers；检查通过后采样。

## Task 3：对照、去诊断和收口

**Files:** 本轮 `tmp/oj-connect-audit/statement-optimization-20261119/` 存脚本、frozen commands、ledger、样本；更新正式性能报告与入口。

- [x] 采用诊断期已核对的 stock Electron 43.7.3 真产品启动，独立 portable/shared/extensions/logs，每次动作前断言生效路径，不主动创建 OJ Session。
- [x] 同样两题、三轮每站，串行测first/next/repeat并核对真实画面；单次读取／失败不重试、不登录提交，首次中位数改善超过25%。
- [x] 撤下临时diagnostic context/span/action/log/test，保留原维护成果与有价值业务回归；最终源码不含诊断入口。
- [x] 跑最终完整扩展／内容／中英渲染、client、transpile、native/workbench、OI、lint/layers、文档／差异，独立审查无阻断。
- [x] 最终无诊断隔离实例看题确认，保存截图；已验证缓存 stage 于 17:54 构建成功，交付负责人验收。

验证入口先依据实际 npm scripts/本地executable预检，冻结到本轮checks/commands。各类型、扩展编译和静态检查120秒，Electron聚焦60秒，stage300秒；非零／超时保留并修复，不以旧输出通过。误用目录清理已单独执行并记录，不扩展到其他路径。

## 执行收口

2026-11-19：Task 1／2 已实施并通过解析、固定传输、Session、取消、工作区／生命周期、内容与共同界面回归；Task 3 的同题集三轮／站取得合计 18/18 正文确认，首次中位数 AtCoder 7.262→1.934 秒、CF 5.586→1.574 秒。CF repeat 0.076→0.598 秒的代价明确保留，不用缓存隐藏。临时诊断和无消费者旧网页读取已移除，原前两阶段文件按快照保全。最终源码矩阵、无诊断实例、独立审查和缓存 stage 结果见[优化结果](../../oj-connect/statement-optimization-2026-11-19.md)与本轮本地 ledger；真实产品负责人验收单独成立。
