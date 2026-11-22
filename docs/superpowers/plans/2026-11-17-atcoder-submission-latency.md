# AtCoder 提交耗时优化实施计划

> **For agentic workers:** 使用 executing-plans 连续执行；独立所有者可并行实施，最后作独立只读审查。2026-11-17 负责人已明确批准修改、实现、测试及干净 stage 交付，不再次停在方案批准。

**Goal:** 以一条按需准备、一次请求、正式回执后立即展示结果的路线优化 AtCoder 提交。

**Architecture:** 当前控制器和受限浏览器宿主继续拥有提交。短生命周期官网提交页与用户浏览器共用会话；结果及不明回执只读查询仅依赖会话，不保留提交页。不增加预热、页面池、队列或备用发送路线。

**Tech Stack:** TypeScript、Electron、Extension API、React、现有 Node／Electron 测试。

**Spec:** [已批准设计](../specs/2026-11-17-atcoder-submission-latency-design.md)。本轮保留当前 dirty worktree，不提交或推送。

**执行状态（2026-11-17）：** 下列任务已实施并完成最终干净 stage 构建，负责人验收待进行。检查与有限真实运行的具体结果见[实施记录](../../oj-connect/atcoder-submission-2026-11-17.md)；下列复选框保留原始任务清单，不将其单独作为验收证据。

## Global Constraints

- 用户发起提交后才创建官网提交页；不先加载题目页、不覆盖用户标签及草稿。
- 完整原生 FormData，明确源码／语言／题目，同源 fetch 一次；不操作 Ace／上传控件，不回退原生按钮。
- 保留唯一新回执、源码核对、会话范围、取消及晚发保护；受理不明只读确认。
- 普通流程不展开浏览器；不修改或绕过网站认证，不引入认证形式和依赖。
- 保护洛谷、CPH 与已认可实时高亮／公式渲染。
- 最终 stage 使用空白数据；测试登录数据和旧 stage 数据不迁入交付物。

## Review Focus

- 验证字段尚未挂载不能被当作免验证：任务 1。
- 脚本排队／取消／响应丢失不能晚发或二次发送：任务 1。
- 提交页销毁后查询、同 ID 不同会话不可串用：任务 2。
- 结果面板慢加载不占用发送通道，旧任务收尾不清除新任务：任务 3。
- WJ／进度／CE 数据不齐时仍准确展示，没有信息不补造：任务 3、4。

## Task 1：单一页面内请求

**Files:** `atcoderWorkflow.ts`、`atcoderShortcut.ts`、`atcoderTransaction.ts` 及对应 common／Electron 回归。

**Interfaces:** 新增 `atCoderSubmitURL(taskURL): string`；逻辑题目 URL 保持不变，实际承载 URL 为官网 submit。`runAtCoderTransaction` 保留外部签名；回执核对可把已读详情交给宿主。只读 reconcile 使用会话而非页面。

- [ ] 先通过受控 Electron 回归证明无 Ace／上传控件、完整隐藏字段、验证延迟、错误返回地址、取消及丢失响应行为；记录 RED。
- [ ] 直接构造表单请求，删除 native Submit 标记／导航循环；固定 POST 及回执 URL，限制响应大小。
- [ ] 运行聚焦检查 GREEN；真实网站直接源码 payload 探针验证一次，核对唯一 ID、源码与终态。

## Task 2：会话读取与任务页释放

**Files:** `browserViewMainService.ts`、`common/browserView.ts`、`browserOjConnectFeature.ts`、`atcoderBridge.ts` 及对应宿主测试。

**Interfaces:** 保留扩展逻辑 page ref；宿主直接打开 submit。正式记录读取／reconcile 绑定 window 和 storageScope；确认时详情只交付一次用于初始结果，后续读取不需要任务页。

- [ ] 增加直接 submit、用户标签不变、页释放后读取及会话不匹配的 RED 回归。
- [ ] 移除仅用于保留页面的 recordViews／attemptViews；保留来源范围与取消边界，复用现有结构化结果映射。
- [ ] 验证终态、已有 CE、失败重试和释放；聚焦宿主检查 GREEN。

## Task 3：交付节奏及共同结果页

**Files:** `workflowController.ts`、`recordController.ts`、共同 record Webview（只在确需时）、相关扩展 tests。

**Interfaces:** `SubmissionHost.openRecord` 保持签名；正式回执后先完成发送任务收尾并释放 busy，再等待面板加载。已有 RecordSnapshot 增加必要的可选轮询间隔时与 canonical DTO 同步。

- [ ] 增加面板未完成仍能接受下一次显式提交、旧 finally 不清新 active 的 RED 回归。
- [ ] 最小调整释放顺序；官网 Interval 有效时使用，缺失沿用既有间隔，不并发轮询。
- [ ] 保持洛谷蓝色转圈与共同布局，实际截图核对窄栏、WJ、进度、AC 和 CE；不造数据、不改渲染底层。

## Task 4：去冗余、正式检查、实测与交付

- [ ] 沿实际消费者删除旧 native／上传路径及其专属测试，保留实验读取、Import、用户草稿与洛谷能力。
- [ ] 主代理复核并独立只读 review；修复具体问题，重跑受影响检查。
- [ ] 预检并冻结完整命令清单，记录失败分类／重跑。源码检查包含扩展 typecheck／完整 test／render、核心与 Electron 宿主回归、定向 lint／分层／文档／diff。
- [ ] 使用隔离实例实测完整按键→结果及各阶段耗时，覆盖正常发送、再次显式发送、另一题／重启；失败保留。只报样本与范围，不声称 p95 或固定秒数。
- [ ] 顺序执行 `npm.cmd run typecheck-client`（120s）、`npm.cmd run compile-oi-extensions`（120s）、`npm.cmd run gulp vscode-win32-x64-min`（300s）。
- [ ] 构建前核对固定 sibling stage 目标，现有程序／数据整体改名保全；构建全新目标，不复制任何旧 data。若占用无法安全替换，只调整本次已确认的 stage，不动日常 D 盘实例。
- [ ] 真实测试使用的诊断端口及临时实例正常收尾。最终交付未写入个人信息的新 stage，源码验证、运行实测、构建和负责人验收分别列明；不做 Setup、Git commit／push。
