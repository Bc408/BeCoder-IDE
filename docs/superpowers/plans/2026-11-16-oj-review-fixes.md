# OJ Connect / Beacon review 缺陷修复计划

> **For agentic workers:** 使用 executing-plans 按任务推进；独立所有权的实现可委派，最终由主代理复核。负责人已明确允许落盘后自行实施、测试并交付 stage，无需再次等待计划批准。

**Goal:** 修复本轮 review 的四项明确问题，移除无消费者控件，交付新的 Windows stage。

**Architecture:** 保留现有原生会话、站点协议、共同工作流与共享渲染所有者。只修复推送生命周期、洛谷异常状态跟踪、Beacon 数学代码保护和公式溢出，不新增通用连接管理器或渲染框架。

**Tech Stack:** TypeScript、Electron、React、remark/unified、KaTeX、现有生产页面测试。

**Spec:** [源码审查](../../oj-connect/review-2026-11-16-atcoder-rendering.md)及本轮负责人已确认的聊天设计：断线后手动继续查询；隐藏／未知状态停止自动跟踪；超宽公式保持字号并局部滚动。

## Global Constraints

- 保留当前 OJ_connect 分支既有未提交改动；本轮不提交或推送 Git。
- 保留登录、认证、提交协议和一次发送／不确定回执保护；AtCoder 不自动显示浏览器。
- 洛谷只有正常 queued／judging 自动跟踪；隐藏／未知显示准确说明，停止转圈，可手动继续查询同一记录。
- 推送失败不自动重连；用户继续查询才重新读取、按需建连。已收到终态不得被随后的 close 覆盖。
- 代码原文、复制结果、空白和尾换行不被数学预处理改写；默认高亮配色保持。
- 普通公式保留现有换行；不可拆超宽公式仅局部横向滚动，不缩字号、不撑宽整个对话。
- 不新增依赖；保留许可／来源记录。生成目录只由构建工具写入。
- 对源码、隔离 Electron、生产页面测量、stage 构建与真实账号验收分别报告。

## Review Focus

- 旧连接失败／关闭晚到，不能删除替换后的新连接。
- 推送终态已经到达但立即断线，不能丢掉已收到的结果。
- 隐藏、未知、显式重查与面板关闭之间不能形成后台循环或迟到 UI 更新。
- 引用／列表围栏、反引号字符串、CRLF 与未完成流式代码都须保持代码原文。
- 窄侧栏长分式的左右两端均可滚动到，流式内容保护不能产生明显 p95 回退。

## Task 1：原生洛谷推送恢复

**Files:** `src/vs/platform/browserView/electron-main/luoguSessionClient.ts`、`scripts/test-luogu-session.cts`。

**Interfaces:** 保留 `readRecord(ref, signal)`、`releaseRecord(ref)`；失败连接按实例身份退出 tracks。继续查询重新读取正式记录，只有 queued／judging 按需建连。

- [x] 添加 socket error→再次读取、已排队终态→close、旧回调晚到的回归；先确认 RED。
- [x] 最小修正失效连接清理及终态交付顺序；保持单次读取并发与释放保护。
- [x] 用现有原生 bundle builder 和同版本 Electron 执行 `scripts/test-luogu-session.cts`，记录 GREEN 及全部既有用例。

## Task 2：停止洛谷隐藏／未知跟踪与移除控件冗余

**Files:** `extensions/becoder.oj-connect/src/recordController.ts`、`src/views/recordPanel.ts`、`src/views/webview.ts`／本地化资源（按实际文案所有者）、`test/recordController.test.ts`、`webview/luogu/uiToolkit.tsx`／`.css`。

**Interfaces:** `RecordController.track()` 保留原有签名；洛谷 unknown 快照仍传给界面，但停止自动读取并提供继续查询。使用既有 rawStatus 的 N/A 区分隐藏；不将其伪装成 finished。

- [x] 将 unknown 零间隔复现固化，验证一次读取后停止、状态原样保留、手动新跟踪可恢复；正常 queued→judging→finished 保持。
- [x] 修复跟踪与提示，旧任务中止后不得更新新任务面板；同步中英文文案。
- [x] 删除 LegacyAutofocus、TextField／TextArea、Checkbox、ProgressRing 及专属 CSS；保留 Button／Dropdown／Option 和共享输入样式。
- [x] 执行扩展 typecheck、完整 test、生产题面／记录渲染测试，核对停止转圈和继续查询入口。

## Task 3：Beacon 代码保真与长公式

**Files:** `extensions/becoder.shared/content/math.ts`／`parser.ts`、`extensions/becoder.beacon/webview/beacon.css`、`extensions/becoder.beacon/test/content-render.mts`（及实际 owning parser 回归）。

**Interfaces:** 保留 `parseBeaconMarkdown(source, { streaming })` 及固定方言行为；优先复用现有 Markdown 结构识别，不再补一套容器正则。不把 Beacon 策略套到洛谷或 AtCoder HTML。

- [x] 固化引用／列表围栏内反引号及 TeX 字符串被改写的 RED；加入行内代码、缩进代码、CRLF、未闭合流式代码及混合公式。
- [x] 最小修正代码区域保护，保留流式未闭合公式体验；记录需要的解析轮次及快速路径。
- [x] 固化窄栏长分式完整可滚动的 RED，修正公式 CSS；查看普通／超宽公式的实际截图。
- [x] 执行 Beacon typecheck、内容／生产页面测试；用既有生产页面对照测量流式每包首见延迟 p95，必要时收敛实现。

## Task 4：整体复核与 stage

- [x] 自审及独立只读复核需求、竞态、死代码、许可、本地化；修正明确发现并重跑受影响检查。
- [x] 最终冻结验证命令及普通文件输入清单，保存精确命令／输出／退出码／失败分类至 `tmp/oj-connect-audit/review-fixes/` 或 `shared-workflow/review-fixes-*`。
- [x] 顺序完成 `npm.cmd run typecheck-client`（120s）、`npm.cmd run compile-oi-extensions`（120s），以及相关定向 lint／分层／文档／diff 检查。
- [ ] 构建前核对标准 sibling stage 目标未运行；若存在则先整体改名保全现有 data／coding，不导入其他旧版本。2026-11-16 本轮检查目标及旧备份均已不存在，因此创建全新 stage，不回收历史数据。构建 `npm.cmd run gulp vscode-win32-x64-min`（300s）；仅在本轮确实保全了数据时才恢复。标准 Gulp 固定构建目标，不假定存在自定义 build root 开关；目标被占用时先解决占用再构建。
- [ ] 构建成功后交付应用路径及验证限制；本轮不扩展 Setup／发布或真实网站提交。


性能收敛保留正常实时能力：7组逐字符流全部 redFrames=0。标准公式+长代码 p95 76.0→75.2ms；TeX转换混排仍72.6→99.5ms，保留正确性并明确剩余开销，不引入分段解析／新缓存。详情见审查记录文末。
