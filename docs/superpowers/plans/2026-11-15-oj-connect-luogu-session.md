# OJ Connect 洛谷共享会话 Implementation Plan

> **For agentic workers:** Use executing-plans or subagent-driven-development task by task. 用户已于本轮明确要求推进实施；不再次请求实施授权。

**Goal:** 洛谷常规刷题脱离目标网页加载，侧栏与浏览器共享登录，修复取消与回执阻塞。

**Architecture:** 保留共同界面与不可变源码任务；洛谷复用上游请求、CSRF 和推送生命周期，浏览器宿主拥有真实 session。传输先验证，不能用假定的网站行为实现。

**Tech Stack:** TypeScript、Electron 43.7.3、VS Code 内置扩展、React；固定上游 v4.20.0。

**Spec:** [已确认设计](../specs/2026-11-15-oj-connect-luogu-session-design.md)

## Global Constraints

- 保留 AtCoder 已有提交事务、目录猜题、CPH、未保存源码快照及精确正式记录。
- 不导出 Cookie、不引入独立凭据存储，不修改日常 D 盘应用或其数据。
- 未知受理不重交，不新增提交等待队列；无 Git、清理或 Setup 操作。
- 有效 rid 不依赖完整记录页面加载；取消必须阻止尚未开始的源码发送。

## Review Focus

脚本启动前取消不得晚发；POST 后晚到正式回执不得丢失；账号切换不得复用前账号缓存；超时／解析错误不得误展开官网；会话隔离与页面释放不得影响用户普通浏览器。

### Task 1: 真实传输验证

**Files:** disposable tmp/oj-connect-audit/session-redesign probe；不修改产品。

- [x] 验证现有独立协议 session 的 session.fetch 题面／记录／配置，记录状态与耗时，不保存私有响应和凭据。
- [x] 同 session 浏览器 WebSocket 订阅 record.track，检查 join_result；仅手动登录，无自动提交。
- [x] 记录实际可用传输。若认证／Origin 失败，诊断并对齐必要设计调整，不实现未经证实的推送。

### Task 2: 取消与误展开

**Files:** browserViewMainService.ts、browserOjConnectFeature.ts、对应聚焦测试／独立测试 helper。

- [x] RED：脚本读取中取消后不得执行，已受理 rid 保留；普通题面错误 visible=0。
- [x] GREEN：宿主取消状态从请求创建时生效并中断准备等待；仅明确交互状态允许 reveal。
- [x] 运行聚焦实际模块测试及 client typecheck；检查并发与页面生命周期。

### Task 3: 同会话请求与正式回执

**Files:** browserView.ts/common/browserView.ts、browserViewMainService.ts、browserOjConnectFeature.ts、Luogu adapter/host/contracts、site-scripts/luogu.ts；只在 Task1 结论明确后冻结具体接口。

- [x] RED：无需目标题目／记录页；正常提交无两轮重复配置／HTML；rid 到达即返回、不等待导航。
- [x] 以固定业务操作传输替代目标网页操作，复用上游请求／CSRF管理，不开放通用凭据网络接口。
- [x] GREEN：未知回执不重交；账号切换失效；双站合成事务通过。

### Task 4: 评测推送与账号管理

**Files:** recordController/adapters、browser host、loginView/extension/package.json、本地化、宿主会话通知及测试。

- [x] RED：推送更新、终态补取、断线／关闭释放；登录双向同步、退出仅对应站点。
- [x] 复用上游 record.track 生命周期；侧栏提供官网登录和退出，按真实会话事件合并刷新。
- [ ] 真实只读身份及合成 UI 响应已验证；负责人在新产品中的练习题提交、登录／退出和实时推送仍待验收。

### Task 5: 整体验证与交付

- [x] 检查命令输入和依赖，记录 RED/GREEN、超时和重跑账本。
- [x] 扩展 typecheck/test/build/render、核心聚焦回归、边界与相关 lint，client/OI 编译。
- [x] staged构建188.77秒成功，含编译器包验证15.06秒通过；原Portable数据已恢复，未构建Setup。
- [ ] 独立审查与真实只读探针完成；新产品真实交互待负责人验收。

## 执行记录

2026-11-15：用户直接批准实施。主代理整合，三个 agent 互斥写入取消、站点传输与侧栏／测试范围，并独立复审。Task1—3及Task4源码／合成回归已完成；Task5源码检查、staged构建和包验证通过，原数据恢复。真实产品提交、退出与推送仍未验收。详见 docs/oj-connect/session-repair-2026-11-15.md 和审计账本。
