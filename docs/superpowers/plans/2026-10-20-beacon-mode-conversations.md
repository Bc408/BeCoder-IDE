# Beacon 三档连续输入与对话继承实施计划

> **For agentic workers:** 使用 executing-plans 在本会话顺序实施。负责人已直接授权形成文档并进入实现，无需重复审批；不执行 Git 写入。

**Goal:** 切档保留输入与页面，跨持久化类别首次发送建立独立快照对话。

**Architecture:** 扩展保留来源 history，待分流输入只在内存；接受发送后创建新的 ChatHistory，原生协调器提供持有租约下的窄草稿清除。分隔作为消息上的非模型元数据随独立快照保存。

**Tech Stack:** TypeScript、React、既有 Code-OSS IPC、Node tests、Playwright。

**Spec:** [正式规则](../../beacon/mode-conversation-design.md)。

## Global Constraints

- 中文文案精确为“已继承上文，开始临时对话”和“已继承上文，建立持久化对话”，英文同步。
- Spot/Flood 不分流；无有效根不能进入 Spot/Flood；Blackout 无新聊天落盘。
- 不新建通用事务平台；保留已有租约/revision；无 Git 写入、无新依赖、无 Setup。
- 本次直接实施授权优先于技能中的重复审批和提交步骤。在现有脏工作树中顺序执行，保留用户改动。

## Review Focus

- 切档后又切回、重复点击同档：不换 ID、不丢输入、不追加分隔。
- 最终发送被运行活动拒绝：页面、来源草稿、附件保持，不能自动补发。
- 分流前输入与发送后新输入：清理只消费已接受版本，不删除新输入。
- 来源保存或租约失败：不声称清理成功；副本不依赖来源文件。
- 连续跨档与重新打开持久化副本：完整上下文和多个分隔保留，删除源不影响副本。

## Task 1：草稿、分流与原生清理

Files: `extensions/becoder.beacon/src/{extension,history,session,context}.ts`、`src/vs/platform/beacon/{common/beaconContext.ts,node/beaconCoordinator.ts,electron-main/beaconContextMainService.ts}`、`src/vs/workbench/contrib/becoder/electron-browser/beaconContext.contribution.ts`。

- [x] 在 attachments.test.ts 添加切档保留、往返、双向分流和来源草稿消费回归；原生基础设施测试覆盖仅持有租约的来源可清除。
- [x] owning 类型检查与生产 bundle 后运行回归，确认因旧隔离行为失败。
- [x] 实施待分流内存输入、独立快照、窄清理 IPC，并阻止跨类别重答/续答/编辑旧消息。
- [x] 回归通过；覆盖空白、附件、拒绝发送、源清理失败、重开与删除来源。

## Task 2：分隔渲染与文档对齐

Files: `webview/{App.tsx,beacon.css}`、`test/render.mjs`、正式 PRD/架构/专项草稿方案、VISION、README 与 implementation-status。

- [x] 非模型元数据在新用户消息之前渲染分隔；主题 token、窄栏换行、无额外卡片。
- [x] 扩展渲染测试覆盖双向分隔、完整上文和窄栏/浅色截图，亲自查看截图。
- [x] 更新正式文档中的被替代规则，保留历史验证记录。

## Task 3：验证与只读复审

- [x] 预检 npm scripts、实际文件与模块，记录 exact commands、exit code、失败分类和重跑。
- [x] owning typecheck/build/tests/lint、原生测试、文档验证、客户端检查、分层、OI 编译和 staged 构建均通过。
- [x] 只读独立审查及主代理复审；修复具体问题并重跑受影响检查。
- [x] 构建和截图已备齐，交付路径及真实应用未验收边界见执行记录；未提交或发布。

## 执行记录

在已有工作树直接实施，无 Git 写入。扩展 159/159、原生 41/41、所属 typecheck/build/lint、client typecheck、layers、OI compile 通过。生产 Webview 渲染通过并检查深浅截图。独立只读复审完成；未将静态复审称为运行验收。详见 `tmp/beacon-mode-conversations/validation.md`；staged 最终重跑退出 0，91.4 秒；首轮外层日志输出编码失败另记为编排失败。应用：`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`；截图：`tmp/beacon-render/mode-inheritance-dark-360.png` 与 `mode-inheritance-light-360.png`。负责人于 2026-10-20 明确反馈验收通过，并授权本地提交及推送当前对应分支；代理未执行的真实桌面、多窗口专项验证不因此补记为通过。
