# AtCoder 稳定性修复与源码对照审查

日期：2026-11-16。本轮先处理 AtCoder 登录状态不稳、提交缓慢及“正在提交”不结束，再只读审查洛谷和 OJ Connect。洛谷微信登录已获负责人确认，本轮不重新改动；不把审查扩大成新功能或渲染框架重写。

上游对照为本地完整 vscode-luogu 4.20.0，提交 `987ca974b5419230a07b59a195ec44026e16f6f4`。生产入口、协议、React 组件、CSS、共享内容解析与流式高亮均沿实际调用链核对。下述 AtCoder 修复、审查发现与负责人随后批准的修复、性能线索分别记录。

## 本轮 AtCoder 修复

- **账号刷新自激循环。** 实测普通首页 GET 会轮换 REVEL_SESSION。原观察器把轮换当作账号变化，又发起账号检查，形成连续刷新。改为直接读取当前存储范围的 Session 首页，固定端点、10 秒期限、4 MiB 上限；同一窗口／会话并发读取合并。普通写入和 overwrite 移除不触发重查，真实删除、过期及登录导航仍刷新；登录／退出会使旧请求失效。旧请求 finally 只删除自己，避免清掉新的读取。
- **任务清理阻塞正式回执。** 不再等待可能永不返回的隔离世界被动清理；只读源码解码／核对也响应所有者中止，防止已提交或失败后仍停在“正在提交”。
- **丢失回包与迟到发送的竞态。** 原生发送脚本带 6 秒执行租约，过期不得再发送。已观察到原生发送标记但 renderer 回包丢失时继续只读核对；标记和回包都丢失但已经导航至本人记录列表时，等租约结束再核对。catch 先清理发送计时器，避免计时器中止本来可成功的恢复。未知受理不重发。
- **重复准备及固定等待。** 移除 openTask 重复检查；基线记录读取与源码准备并行。原生导航观察缩至 250ms，无候选后的只读复查为 1 秒；验证就绪等待最多 20 秒，超时在插件内提示主动处理，不自动展开网页。
- **去掉死路径。** 删除已无生产消费者的注入式账号读取；显式退出保留实际需要的身份解析。提交、确认、核对和结果跟踪均不得自动显示浏览器，侧栏主动登录不受影响。

测试覆盖单次发送、旧记录排除、源码核对、草稿保护、取消后迟到脚本、验证码迟到、回包丢失、清理不返回和无浏览器展开。最终 17 项同版本 Electron 合成事务测试通过；新增丢失标记用例经历 RED→GREEN。账号原生夹具覆盖轮换、真实过期、并发、窗口／范围隔离及旧读取失效；工作台补充夹具通过 19 项。它们不等于真实账号新提交验收。

## 审查发现及后续修复

### P2：洛谷推送失败后，“继续查询”仍复用坏连接

位置：`src/vs/platform/browserView/electron-main/luoguSessionClient.ts` 的 `record()`／`createTrack()`，`extensions/becoder.oj-connect/src/views/recordPanel.ts` 的重试入口。

`dispose()` 保存 failure 并关闭 socket，却未从 tracks 移除该连接；下次 `record()` 仍调用同一对象的 `next()`，重复抛出旧错误。推送已排入最终结果但随后收到 close 时，先检查 failure 也可能丢掉排队的结果。

隔离复现：触发 socket.onerror，随后三次读取均为 `luogu-push-failed`，HTTP 与 socket 创建次数仍各为 1。上游 `src/features/record.ts` 的重试重新进入 `connectWebsocket()`，没有复用故障连接。

后续已修复：失败读取按对象身份移除故障 track，不自动重连；显式继续才重新读取并按需建连。next 优先交付已排队快照，避免终态被 close 覆盖。新增真实同版本 Electron 合成回归，覆盖失败恢复、禁止自动重连、旧 close 晚到不影响替换连接及终态后立即 close。

### P2：洛谷隐藏／未知状态进入零延迟 HTTP 循环

位置：`extensions/becoder.oj-connect/src/views/recordPanel.ts`、`src/recordController.ts`、核心 `common/luoguProtocol.ts` 与 `electron-main/luoguSessionClient.ts`。

洛谷跟踪 interval 为 0，原意是由推送等待控制节奏；但只有 queued／judging 建立推送。隐藏或未知状态解析成 unknown，控制器又只对 finished 停止，于是持续 HTTP 查询直到整轮期限。

隔离复现：unknown 连续读取 20 次，全部 sleep 参数为 0。上游仅在 status 0／1 启动推送，并未对隐藏记录做这样的快速轮询。

后续已按负责人确认修复：洛谷 unknown 原样交付后停止自动跟踪，隐藏与不识别状态分别说明，保留快照、停止转圈并提供继续查询。推送变为 unknown 时释放旧连接；显式继续重新读取当前正式记录。正常 queued／judging 行为不变，面板关闭或旧任务迟到不更新新任务。扩展及原生回归覆盖一次读取停止和手动恢复。

## 复用、冗余和抽象边界

OJ Connect 已直接迁入上游 CSRF 管理、题面／记录组件、Time、复制控件和请求桥接等实现；个别文件保留 4.18.2 来源头，不足以据此认定它们偏离 4.20.0。应按实际内容与调用比较。上面两项洛谷缺陷是连接生命周期及通用跟踪策略偏离上游行为的具体例子。

`webview/luogu/uiToolkit.tsx` 中 LegacyAutofocus、VSCodeTextField／TextArea、VSCodeCheckbox、VSCodeProgressRing 当前无生产消费者。它们已被 tree shaking 排除。后续已删除这些定义及专属 CSS，保留 Button／Dropdown／Option 与共用样式；这是源码去冗余，不构成运行时加速依据。

保留 BrowserSession 凭据所有权、固定宿主操作、站点适配、共同 DTO、源码绑定和显式 CPH 导入：它们落实已确认的产品／权限边界，不能为“照搬”重新引入上游独立 Cookie 仓库或外围功能。桥接任务／不确定回执、工作台正式记录上下文、原生推送连接的生命周期不同，不宜硬并为一个通用管理器。

共享 Markdown／语法 Worker／DOM 展示已经有实际复用；`MarkdownService.clear`、`IncrementalSyntax.update` 当前主要由测试消费，接口本身不足以证明过度设计。

## 证据与验收限制

AtCoder 本地审计输出位于忽略目录 `tmp/oj-connect-audit/`。精确命令、退出码及失败日志保留于 `shared-workflow/atcoder-stability-*`，最终检查清单见 `atcoder-stability/validation-plan.json` 和 `close-validation-plan.json`。RED、超时和编排失败不会被后来的 GREEN 覆盖。上述两项洛谷问题最初由独立审查代理在内存加载源码复现；随后负责人批准修复，已落地 owning 回归与生产截图。后续计划见 `docs/superpowers/plans/2026-11-16-oj-review-fixes.md`，本轮 RED／GREEN 与性能记录使用 `shared-workflow/review-fixes-*` 和 `review-fixes/`，与前轮输出分开保存。

同版本 Electron 的本地慢资源页证明：DOM ready 后调用 isolated-world 脚本仍可能等整页资源加载；改用 isLoadingMainFrame 无法解决该等待。真实只读探针也观察到验证子框架连接失败，因此本轮不能承诺消除网络／网站验证导致的全部耗时。未因此添加 debugger、另一套浏览器执行通道、代理／TLS 修改或新认证支持。

本轮没有发送真实站点解答。最后一次直接会话探针返回 signed-out，只能证明该会话读取与并发去重，不作为已登录验收或宣称已有凭据丢失的依据。stage 源码检查与构建结果独立记录；负责人仍需在新 stage 登录并核对新提交 ID、最终结果和实际等待时间。

前轮 AtCoder 构建前检查：client 类型检查、全体 OI 扩展编译、分层检查、定向 ESLint（0 警告）、文档结构及 diff 空白检查通过。扩展测试 76 项、Electron 事务 17 项、工作台补充测试 19 项，以及原生账号／洛谷会话夹具分别通过。命令输出中的既有 npm 配置废弃提示仍保留。最终 stage 构建单独记录为 `shared-workflow/atcoder-stability-stage.json`，只有该命令退出 0 才算构建成功；本文不预先宣称 GUI 或真实交题验收。

## 当轮 OJ 验证记录

OJ Connect 78 项测试、双站题面／记录生产页面通过。原生洛谷夹具覆盖断线恢复、终态后 close、隐藏／未知状态手动重查，AtCoder 17 项合成提交回归通过。

client、全体 OI 扩展编译、分层与定向 ESLint（0 警告）通过。样式命令退出 0，不能据此宣称没有诊断；本次改动未增加 CSS 变量。精确命令与失败／成功日志见 `shared-workflow/review-fixes-*`；冻结输入与压力结果见 `review-fixes/`。本轮没有新增依赖或改动来源许可。

本轮检查时标准 stage 目录及此前备份已不存在，计划创建全新 stage，不回收历史登录数据。最终构建以 `shared-workflow/review-fixes-close-stage.json` 的退出码为准；未构建 Setup、未提交／推送 Git，真实账号流程仍待负责人在新构建验收。
